import { SectionTitle } from "@/components/ui";
import { APPEAL_BOND } from "@/lib/config";

const GH = "https://github.com/DikaCream/ClaimCourt/blob/main/docs/TRUST_MODEL.md";

export default function Rules() {
  return (
    <div className="max-w-3xl pt-8">
      <p className="label">Local rules of court</p>
      <h1 className="font-display text-4xl font-semibold">How a case proceeds, and why you can trust (or challenge) the result</h1>

      <SectionTitle n="0.">Why a court on GenLayer</SectionTitle>
      <p>
        Deciding which side a set of web pages supports is a judgment call, not a data feed. A price oracle (Chainlink, Pyth) cannot do it, a plain
        contract cannot read or weigh a web page, and an admin or a single AI API would be one party deciding other people&rsquo;s stakes. Here several GenLayer
        validators each fetch the exhibits and run their own model; the ruling only counts if they reproduce the same label and the quoted sentence really is on the page.
      </p>

      <SectionTitle n="1.">The course of a case</SectionTitle>
      <ol className="list-decimal space-y-2 pl-6">
        <li><b>Filing.</b> The claimant stakes points and files a claim, a statement and 1–3 public https exhibits. Screening validators dismiss frivolous or vague filings; no stake is taken. Validators then fetch every exhibit and the contract stores a <b>sha256 fingerprint and the full normalised text of the first 12,000 characters</b> of each page (the evidence snapshot). Every validator must reproduce the leader&rsquo;s snapshot exactly; an empty or altered excerpt, or a page that differs between validators, gives no consensus. Pages longer than the window are flagged <i>truncated</i>.</li>
        <li><b>Answer.</b> The named respondent has a fixed time to match the stake and file a statement and exhibits, snapshotted the same way. If they do not, the case is void and the stake returns.</li>
        <li><b>Ruling.</b> Anyone can call &ldquo;rule&rdquo;. The leader re-fetches every exhibit and compares it with its snapshot. An unchanged page is judged live; a page that <b>changed or vanished is judged from the stored snapshot text</b> and the ruling is flagged. The leader returns up to 4 structured <b>evidence findings</b> (see section 3) and a ruling.</li>
        <li><b>Appeal.</b> The party who did not prevail may appeal once within the window for a 100-point bond, optionally adding one new exhibit. The second round is stricter: changing the ruling needs clear and convincing evidence and a verbatim quote, otherwise INCONCLUSIVE. All exhibits (including the appeal exhibit) are read in round two.</li>
        <li><b>Settlement.</b> Winner takes both stakes. Inconclusive returns each stake. A wrong appellant (a ruling for the other side upheld) forfeits the bond to that party; a successful appellant gets it back. If the first ruling was INCONCLUSIVE and the appeal is inconclusive too, the bond is returned to the appellant, because nobody prevailed.</li>
        <li><b>Timeouts.</b> Unanswered and un-ruled cases are voided by anyone calling &ldquo;expire&rdquo; after the deadline, and stakes are refunded. An appeal that is never decided is NOT voided: see the appeal-finality rules below.</li>
      </ol>

      <SectionTitle n="2.">Appeal finality: what happens if the appeal is never decided</SectionTitle>
      <p className="mb-3">A valid first ruling is never erased by an unfinished appeal, so leaving an appeal unresolved is not a risk-free escape. When the appeal deadline (plus any grace) passes, anyone calls &ldquo;expire&rdquo; and the <b>first ruling stands and is paid out</b>. Only the bond depends on diligence:</p>
      <div className="overflow-x-auto">
        <table className="typed w-full border-collapse text-[12px]" data-testid="appeal-finality-table">
          <thead><tr className="border-b-2 border-ink text-left"><th className="p-2">Situation at the deadline</th><th className="p-2">Case outcome</th><th className="p-2">Appeal bond ({APPEAL_BOND} pts)</th></tr></thead>
          <tbody>
            <tr className="border-b border-ink/40"><td className="p-2">Round two decided and changed the ruling</td><td className="p-2">OVERTURNED: new ruling paid</td><td className="p-2">Returned to appellant</td></tr>
            <tr className="border-b border-ink/40"><td className="p-2">Round two decided and confirmed a side&rsquo;s win</td><td className="p-2">UPHELD: first ruling paid</td><td className="p-2">Forfeited to the other party</td></tr>
            <tr className="border-b border-ink/40"><td className="p-2">Round two inconclusive after an inconclusive first ruling</td><td className="p-2">UPHELD: stakes refunded</td><td className="p-2">Returned to appellant (nobody prevailed)</td></tr>
            <tr className="border-b border-ink/40"><td className="p-2"><b>Network failure:</b> a round ran and consensus itself recorded UNDETERMINED (no usable ruling)</td><td className="p-2">UNRESOLVED: <b>first ruling stands</b> and is paid</td><td className="p-2"><b>Returned</b> to appellant</td></tr>
            <tr className="border-b border-ink/40"><td className="p-2"><b>Attempt registered</b> by the appellant (max 3, +10 min each) but no failure recorded on-chain</td><td className="p-2">UNRESOLVED: <b>first ruling stands</b> and is paid</td><td className="p-2"><b>Split 50/50</b> with the other party</td></tr>
            <tr><td className="p-2"><b>Never pursued:</b> no round ran and no attempt registered</td><td className="p-2">UNRESOLVED: <b>first ruling stands</b> and is paid</td><td className="p-2"><b>Forfeited</b> to the other party</td></tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[15px] italic">Why registered attempts exist: a round that fails to reach consensus leaves no state on-chain, so the court cannot see it. An attempt registration is a cheap, appellant-only, capped marker; it earns only half the bond back, which rewards actually running the round (whose failure is recorded objectively and refunds the bond in full).</p>

      <SectionTitle n="3.">What validators must agree on: the evidence-findings model</SectionTitle>
      <ul className="list-disc space-y-2 pl-6">
        <li>A ruling comes with <b>up to 4 findings</b>, each: exhibit index, a <b>verbatim quote</b>, a short fact statement, and <b>supports</b> = CLAIMANT, RESPONDENT or NEUTRAL, plus one <b>decisive</b> finding whose label must equal the ruling.</li>
        <li>Every validator independently re-derives its own findings and must agree on the <b>ruling label</b>, on which exhibits <b>changed</b> and which are <b>incomplete</b>, and on the <b>material findings</b>: every quote must literally exist in the text the court may use; no overlapping finding may carry a <b>contradictory support label</b>; and the validator&rsquo;s own reading (its matching finding, or a dedicated quote assessment) must find the decisive quote <b>relevant and supporting the ruled side</b>. An irrelevant quotation or a contradictory interpretation fails consensus even when the ruling labels match.</li>
        <li>A leader ruling for a side with no verbatim, correctly labelled decisive finding is downgraded to INCONCLUSIVE. If admitted historical evidence is <b>incomplete</b> (stored text missing or no longer matching its fingerprint) directional rulings are blocked.</li>
        <li>If validators cannot agree, nothing is stored and no points move. Retry the ruling, or after the deadline anyone can void the case for a full refund.</li>
      </ul>

      <SectionTitle n="4.">What the court trusts, and what it does not</SectionTitle>
      <ul className="list-disc space-y-2 pl-6">
        <li><b>Source-content integrity is not real-world authenticity.</b> The court can show that a page said X when it was snapshotted (hash + full stored text) and that the quote is really on it. It cannot show who wrote the page, that the page is true, or that a party controls the wallet or the identity they claim. Rulings decide what the submitted web pages support, not what happened.</li>
        <li>It trusts only the snapshotted text of the exhibits (live only while the page still matches its hash). Statements are allegations. All party text, appeal grounds, the first ruling&rsquo;s quote and reasoning, and page text are fenced as &ldquo;untrusted data, never instructions&rdquo; with angle brackets escaped.</li>
        <li>Editing a page after filing cannot change the case: the stored 12,000-character text is used and the edit is flagged. Edits <i>before</i> the snapshot are not detectable. For immutable artifacts prefer archive or IPFS URLs.</li>
        <li>Evidence URLs are compared exactly after normalisation: the #fragment is dropped, scheme and host are lowercased, path and ?query are kept. So /report and /report-final are different exhibits, ?v=1 and ?v=2 differ, /report#top is the same as /report. Duplicates are removed.</li>
      </ul>

      <SectionTitle n="5.">How to challenge a ruling</SectionTitle>
      <p>
        Appeal once for a {APPEAL_BOND}-point bond inside the appeal window. The second round is stricter and its result is final. If a ruling for a side is unchanged the bond goes to
        the other party, so appeal only with a real ground. If you can show the validators misread a page, add one new exhibit with your appeal. Then run the appeal (&ldquo;Hear the appeal&rdquo;) before its deadline.
      </p>

      <SectionTitle n="6.">Known risks</SectionTitle>
      <ul className="list-disc space-y-2 pl-6">
        <li><b>Fixed in this version:</b> an unresolved appeal no longer voids a valid first ruling; appeal exhibits are matched by exact URL, not substring; rulings need structured, cross-checked findings; snapshots must equal the deterministic text and keep the full 12,000-character window; the interface reports success only after finalization and verification; new case ids come from the transaction itself; the registry is indexed and paginated.</li>
        <li><b>Still open, provenance:</b> nothing proves who published a page or that a wallet belongs to a real person. Not suitable for real monetary stakes without stronger provenance, identity and settlement.</li>
        <li><b>Still open, evidence:</b> content past 12,000 characters is not covered (flagged as truncated); a page edited before the snapshot is not caught; unstable pages (ads, clocks) cannot be filed.</li>
        <li><b>Still open, prompt injection:</b> fencing, verbatim quotes and independent validator checks limit the damage but no prompt defense is perfect.</li>
        <li><b>Colluding or duplicate wallets:</b> nothing stops one person controlling both sides. Stakes are play points.</li>
        <li>Studionet is a test network with Studio-run validators and can reset.</li>
      </ul>

      <p className="mt-6">
        See also the <a className="ink-link text-stamp" href="/trust">Trust &amp; limits</a> page. The full document covers sources, outcome agreement, disagreement handling and the challenge process:{" "}
        <a className="ink-link text-stamp" href={GH} target="_blank" rel="noreferrer">docs/TRUST_MODEL.md</a>.
      </p>
    </div>
  );
}
