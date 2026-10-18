# ClaimCourt trust model

ClaimCourt is **not** a generic oracle and not a price feed. It is a small, bounded **dispute court**: two
named wallets escrow equal stakes, each files a statement plus up to three public evidence URLs, and GenLayer
validators decide which side the *submitted evidence* supports. This document states precisely what is trusted,
how validators reach agreement, what happens when they do not, and how a result can be challenged.

Contract: [`contracts/claimcourt.py`](../contracts/claimcourt.py). Network: GenLayer Studionet (chain 61999).
Stakes are **points with no monetary value** (1,000 free starting points per wallet).

## 0. Why this needs GenLayer (and not an oracle or a normal contract)

The on-chain question is "which side do these web pages support?", which needs reading unstructured text and weighing it.

| Option | Why it does not work here |
|---|---|
| Price/data oracle (Chainlink, Pyth) | Delivers numbers from pre-agreed feeds. A dispute has no feed; the evidence is whatever pages the parties cite. |
| Plain smart contract | Cannot fetch or interpret a web page; it could only count votes from humans (a jury DAO with its own bribery and liveness problems). |
| Admin or arbitrator key | One party decides other people's stakes. |
| Single off-chain AI API | One operator and one model, nothing on-chain to agree on, no way to challenge. |
| **GenLayer** | Each validator fetches the pages itself and runs its own LLM. The result is accepted only if validators reproduce the same ruling label and the quote is verifiably on the page (custom equivalence principle). Disagreement stores nothing. |

Deterministic code (stakes, deadlines, URL rules, payouts, quote-on-page check, downgrade to `INCONCLUSIVE`) stays in plain
contract logic. AI is used only for the reading-and-judging step.

## 1. Sources: what the court reads

| Input | Who supplies it | How it is constrained |
|---|---|---|
| Claim, relief, statements | The parties | Length-limited text. Treated as **allegations, never as facts**. The prompt tells the model so. |
| Evidence URLs (1–3 per side, +1 on appeal) | The parties | Deterministic on-chain checks: `https://` only, no IPs / localhost / userinfo / ports, no URL shorteners or paste sites, no duplicates, max 300 chars. |
| Page content | The web, fetched by each validator itself with `gl.nondet.web.render` | Truncated to 12,000 chars per page. Instructions found inside a page are explicitly ignored by the prompt. |

The contract has **no admin, no owner, no oracle key and no off-chain input**. Nobody can write a ruling except
through validator consensus on the `rule` and `rule_appeal` transactions. Anyone can trigger those calls.

What is *not* trusted: the parties' statements; the order of URLs; any claim not backed by a page quote.

Known limitation: whoever controls an evidence page can change it. The court judges the page **as fetched by the
validators at ruling time**. Parties should prefer archived or otherwise stable sources (for example web
archives, signed releases, public registries, wikis with history). A page that changes between the leader's
fetch and a validator's fetch makes the quote check fail, which pushes the outcome to *no consensus* (section 3), never to a
silent wrong ruling.

## 2. Outcome agreement: how validators agree

A ruling is one of `CLAIMANT`, `RESPONDENT` or `INCONCLUSIVE`, with `reasoning` and a verbatim `evidence_quote`
from a named `source_url`. It uses GenLayer's **custom equivalence principle** (`gl.vm.run_nondet_unsafe`):

1. **Leader** fetches every exhibit, prompts the LLM ("reply in English", JSON only) and proposes a ruling.
   The proposal is sanitised deterministically: an unknown label becomes `INCONCLUSIVE`; a ruling for either side is **downgraded to
   `INCONCLUSIVE` unless it cites one of the submitted URLs and a quote of at least 8 normalised characters**.
2. Every **validator** independently re-fetches the cited page and checks that the leader's quote **literally appears in that page**
   (case/punctuation-normalised). A fabricated or paraphrased quote makes that validator vote *disagree*.
3. Each validator then runs the **whole judgment itself** (own fetches, own LLM call) and votes *agree* only if its own
   ruling label equals the leader's.
4. Only a majority-agreed result is written. **What must match across validators:** the ruling label, and (for a ruling for a side) a quote that exists on the cited page.
   Not compared: reasoning text, and the *choice* of quote (a validator may have picked a different sentence, it only has to confirm the leader's exists). The stored reasoning, quote and source are the leader's. Free-text reasoning is **not** compared; only the label and the verifiable quote are. This is deliberate:
   prose differs between LLMs, but a label and a quote that exists on the page can be checked mechanically.

Resulting guarantees: (a) no side can win on statements alone, (b) every non-inconclusive ruling is tied to text a human can open and read at the cited URL,
(c) uncertainty resolves to `INCONCLUSIVE`, which refunds both stakes, so doubt never transfers value.

Note: the **filing screen sees only the text and the URL strings, not the page contents**. It can reject a claim that is vague or cannot
be settled from public pages, but it cannot confirm that the URLs actually support the claim.

Filing is screened the same way: validators must agree on a `valid` boolean. Frivolous, vague, purely subjective, unprovable-from-public-pages,
harassing or illegal complaints are stored as `REJECTED` and **no stake is taken**.

## 3. Disagreement and failure handling

| Situation | What happens |
|---|---|
| Validators disagree on the label, or a quote cannot be verified | No majority, the transaction is not accepted, **no ruling is stored**. The case stays `READY` until its ruling deadline, then anyone calls `expire` and **both stakes are refunded**. Anyone may also retry `rule` before the deadline. |
| All evidence pages fail to load | Deterministic `INCONCLUSIVE` ruling (both refunded after the appeal window). |
| Respondent never answers | After `respond_by`, `expire` voids the case and refunds the claimant. |
| Ruling is never produced | After `responded_at + ruling_timeout`, `expire` voids the case and refunds both. |
| Appeal is filed but never decided | After `appealed_at + appeal_timeout`, `expire` voids the case, refunds both stakes **and returns the appeal bond**. |
| Ruling exists but nobody calls `finalize` | After the appeal window anyone can call `finalize`; funds stay escrowed until someone does (no one is privileged to block it). |
| Claimant changes their mind before an answer | `withdraw_case` refunds the stake. |

All deadlines are chosen by the claimant at filing, bounded to 60 seconds–14 days, stored on-chain and enforced by
block time inside the contract. **No case can hang**: every non-final state has a public, permissionless exit (`expire`, or `finalize` after the appeal window). Each is a normal transaction that someone must submit.

## 4. Challenge process: the appeal round

* **Who:** a party who did **not** prevail (the prevailing party cannot appeal; if the first ruling was `INCONCLUSIVE`, either party may).
* **When:** within the appeal window set at filing (60 s–14 days after the ruling).
* **Cost:** a **100-point bond**, escrowed immediately.
* **What:** the appellant gives grounds (20–500 chars) and may add **one new exhibit URL**. `rule_appeal` re-runs the full leader/validator process
  over *all* exhibits with a **stricter standard**: the prompt shows the first ruling and the grounds, and instructs the model to change the ruling only if the
  evidence is *clear and convincing* with a verbatim quote, otherwise to answer `INCONCLUSIVE`.
* **Outcome:** if the second ruling **differs** from the first (including a move to `INCONCLUSIVE`) the appeal succeeds: the bond is returned and the new ruling is final.
  If it is **the same**, the appeal fails: the **bond is forfeited to the opposing party** and the first ruling is final.
* **Appeal of an `INCONCLUSIVE` ruling:** either party may appeal. If the second round is again `INCONCLUSIVE`, the appeal is "upheld" and the appellant forfeits the bond to the other party, even though that party did not win.
* **Appeal inputs are untrusted free text.** The appellant's grounds (and the first ruling's quote) go into the appeal prompt without a fence, so the appeal round is a larger prompt-injection surface than the first round. The verbatim-quote check and the `INCONCLUSIVE` downgrade still apply to the output.
* **One appeal only.** The second ruling is final. This bounds cost and prevents infinite relitigation.
* **Settlement:** `CLAIMANT` → claimant receives both stakes; `RESPONDENT` → respondent receives both; `INCONCLUSIVE` → each stake is returned.
  Points are never created or destroyed; the e2e script checks conservation.

Why the bond: it makes weak appeals costly, and the forfeiture is paid to the party who was dragged through a needless second round.

## 5. Residual risks (stated honestly)

1. **Mutable evidence.** See section 1. Mitigation: archived sources; the quote check; ruling labelled as of fetch time.
2. **Model error.** An LLM can misread a page. Mitigations: quote must exist verbatim, uncertainty falls back to `INCONCLUSIVE`, stricter appeal.
   Not eliminated: the quoted sentence might be read in the wrong sense by *all* validators.
3. **Shared model bias.** Validators may run similar models; agreement is evidence of reproducibility, not of truth.
4. **Prompt injection.** Pages can contain adversarial text. Mitigations: prompt hardening, deterministic sanitising and the verbatim-quote requirement. Not eliminated.
5. **Sybil / collusion between parties.** A claimant can name a second wallet they control. Because stakes are valueless points, nothing is gained. Use with real value requires identity or reputation on top.
6. **Studionet is a testnet environment.** Validator sets and LLMs there are not production-grade decentralised security.
7. **Scope.** Disputes must be decidable from public web pages. Anything needing private documents, testimony or legal interpretation is out of scope and should be dismissed at filing or end `INCONCLUSIVE`.

## 5b. Attack scenarios and mitigations

| Attack | What can happen | Mitigation in code | Not mitigated |
|---|---|---|---|
| **Prompt injection** via evidence page or statement/appeal text | Page text tries to order "rule CLAIMANT" | Prompt marks statements as allegations and tells the model to ignore instructions in pages; a ruling for a side needs a verbatim quote from a *submitted* URL (else `INCONCLUSIVE`); validators re-run independently | A page that genuinely contains a persuasive quote the models misread; the appeal text is unfenced |
| **Evidence swap (bait and switch)** | A party edits their page after the other side staked, or between the leader's and a validator's fetch | Quote must exist on the page at each validator's fetch; mismatch means no consensus and a refund path | Both sides' validators fetch the *edited* page and agree. Read exhibits before staking; prefer archives |
| **Ruling-time manipulation** | A party who controls a page times the `rule` call (anyone can call it) for when their page says what they want | Respondent can also call `rule` early; deadlines limit stalling; stricter appeal | No snapshotting of evidence at filing time (would need on-chain hash or archive) |
| **Sybil / self-dealing** | One person controls claimant and respondent | Respondent must be a different address | Cannot be detected; harmless while points are valueless |
| **Collusion with validators** | A validator majority colluding | Out of scope; trust is in the network's consensus | Studionet validators are Studio-run, not a decentralized staked set |
| **Front-running `rule`/`appeal`** | Observer races to call `rule` | Outcome does not depend on who calls it | Caller chooses timing (see above) |
| **Stalling** | Respondent never answers, nobody rules | `respond_by`, ruling timeout, appeal timeout, permissionless `expire` | Needs someone to submit the tx |
| **Page-size padding** | Huge page hides the relevant text past the 12,000-char cut | Model sees the first 12,000 characters only; quote must be on the page | Choose short, focused exhibits |
| **Appeal spam** | Repeated relitigation | Exactly one appeal, 100-point bond | Bond is small relative to stake if stakes grow |
| **Gaming the filing screen** | Claimant crafts a claim the AI screen approves but cannot be settled | Result is `INCONCLUSIVE` with full refund | Costs the respondent a round of time |

## 6. Verifying a ruling yourself

Every ruling stores: the label, the reasoning, the verbatim quote, the exact source URL, the list of exhibits read and the
timestamp (`get_evidence(case_id)`). To check one: open the cited URL, search for the quote, and confirm it supports the label.
If it does not, use the appeal round. All transactions are visible in the [Studionet explorer](https://explorer-studio.genlayer.com).
