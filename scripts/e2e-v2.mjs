// Corrected-workflow runs on Studionet (throwaway wallets). Usage: node scripts/e2e-v2.mjs <scenario>
//   upheld        round 1 rules, the loser appeals, the stricter round confirms (bond forfeited)
//   overturn      round 1 INCONCLUSIVE, the appellant adds an exhibit, round 2 flips it (bond returned)
//   inconclusive  INCONCLUSIVE first, INCONCLUSIVE again on appeal (bond returned, nobody paid)
//   uncompleted   an appeal nobody pursues: first ruling stands, bond forfeited (appeal-finality rules)
//   registered    appellant registers an attempt but no round runs: first ruling stands, bond split 50/50
//   overlap       claimant exhibit .../report, appeal exhibit .../report-final#frag: both must reach round two
//   concurrent    four wallets file at the same time: each must learn its own, distinct case id
// Writes deployments/e2e-v2-<scenario>.json (tx hashes, observed outcomes, FINALIZED confirmation).
import { Run, read, file, now, sleep, ADDRESS, RAW, EIFFEL, EIFFEL_CLAIM, EIFFEL_STMT_R, OVERTURN } from "./e2e-lib.mjs";

const name = process.argv[2];
const run = new Run(name);
const A = run.actor("A"), B = run.actor("B");
const caseOf = async (id) => read("get_case", [id]);
const bal = async (a) => (await read("get_user", [a.address])).balance;
const waitUntil = async (ts) => { const w = ts - now() + 6; if (w > 0) { console.log(`[${name}] waiting ${w}s`); await sleep(w * 1000); } };
const otherOf = (c) => (c.ruling === "CLAIMANT" ? B : A);
const idOf = (r) => r.values.id;

async function fileAndAnswer(title, urlsA, urlsB, o = {}, claim = EIFFEL_CLAIM, stmtR = EIFFEL_STMT_R) {
  let id, c;
  for (let attempt = 1; attempt <= 3; attempt++) { // the AI filing screen is non-deterministic: a dismissal is retried (and recorded)
    const f = await file(run, A, B, title + (attempt > 1 ? ` (refiled ${attempt})` : ""), claim, urlsA, o);
    id = idOf(f);
    run.check("file_case receipt returns the case id", Number.isInteger(id), { id });
    c = await caseOf(id);
    run.check(`case exists with this claimant (attempt ${attempt})`, c.claimant === A.address, { status: c.status, reject: c.reject_reason });
    if (c.status === "AWAITING_RESPONSE") break;
  }
  if (c.status !== "AWAITING_RESPONSE") throw new Error("filing rejected: " + c.reject_reason);
  await run.write("respond", B, "respond", [id, stmtR, urlsB]);
  await run.write("rule", A, "rule", [id]);
  return id;
}

await run.start(A, B);
const startA = await bal(A), startB = await bal(B);
console.log(`[${name}] contract ${ADDRESS} A=${A.address} B=${B.address}`);

if (name === "upheld") {
  const id = await fileAndAnswer("Eiffel bet - appeal upheld", [EIFFEL], [EIFFEL]);
  let c = await caseOf(id);
  const ev1 = await read("get_evidence", [id]);
  run.check("round 1 stored structured findings with a verbatim decisive quote", ev1[0].findings.length >= 1 && (c.ruling === "INCONCLUSIVE" || (ev1[0].decisive >= 0 && ev1[0].evidence_quote.length > 0)), ev1[0].findings);
  const loser = c.ruling === "RESPONDENT" ? A : B;
  await run.write("appeal by the losing party", loser, "appeal", [id, "Please re-examine the fact sheet; I say the first ruling misread the stated height of the tower.", ""]);
  await run.write("rule_appeal", A, "rule_appeal", [id]);
  c = await caseOf(id);
  run.check("appeal decided and case FINAL", c.status === "FINAL" && ["UPHELD", "OVERTURNED"].includes(c.appeal_result), { first: c.first_ruling, final: c.ruling, appeal: c.appeal_result, bond: c.appeal_bond_outcome });
  run.check("expected scenario: appeal UPHELD", c.appeal_result === "UPHELD", c.appeal_result);
} else if (name === "overturn" || name === "inconclusive") {
  const v = "a";
  const id = await fileAndAnswer(`Sticker order 4417 refund (${name})`, [OVERTURN(v, "claimant-invoice")], [OVERTURN(v, "respondent-delivery")], { relief: "Respondent refunds the 50 point deposit", stake: 50 },
    "Studio Lanna promised to deliver order #4417 (200 printed stickers) by 2026-10-01 and the order confirmation promises a refund of the 50 point deposit if it is late. The published order page and the public courier log (both linked as exhibits) show whether the parcel was delivered by that date.",
    "The courier log shows the parcel was delivered on time on 2026-10-01 and signed for, so no refund is owed.");
  let c = await caseOf(id);
  console.log(`[${name}] first ruling ${c.ruling}`);
  const appellant = c.ruling === "CLAIMANT" ? B : A;
  const extra = name === "overturn" ? OVERTURN(v, "appeal-correction") + "#notice" : "";
  await run.write(`appeal by ${appellant.label}${extra ? " with a correction notice (URL carries a #fragment)" : " without new evidence"}`, appellant, "appeal",
    [id, "The courier log entry has no reliable order number; I ask the court to re-examine all exhibits.", extra]);
  c = await caseOf(id);
  if (extra) run.check("appeal exhibit stored canonically (fragment stripped)", c.appeal_evidence.length === 1 && !c.appeal_evidence[0].includes("#"), c.appeal_evidence);
  await run.write("rule_appeal", A, "rule_appeal", [id]);
  c = await caseOf(id);
  const ev = await read("get_evidence", [id]);
  run.check("both rounds recorded", ev.length === 2 && ev[1].kind === "APPEAL", ev.map((e) => e.kind + ":" + e.ruling));
  if (extra) run.check("appeal exhibit reached round two", ev[1].sources.some((u) => u.endsWith("a-appeal-correction.txt")), ev[1].sources);
  run.check("case FINAL after appeal", c.status === "FINAL", { first: c.first_ruling, final: c.ruling, appeal: c.appeal_result, bond: c.appeal_bond_outcome });
  if (name === "overturn") run.check("expected scenario: appeal OVERTURNED", c.appeal_result === "OVERTURNED", { first: c.first_ruling, final: c.ruling, appeal: c.appeal_result });
  else run.check("expected scenario: INCONCLUSIVE twice, bond RETURNED", c.first_ruling === "INCONCLUSIVE" && c.ruling === "INCONCLUSIVE" && c.appeal_bond_outcome === "RETURNED", { first: c.first_ruling, final: c.ruling, bond: c.appeal_bond_outcome });
} else if (name === "uncompleted" || name === "registered") {
  const id = await fileAndAnswer(`Eiffel bet - appeal ${name}`, [EIFFEL], [EIFFEL], { at: 60 });
  let c = await caseOf(id);
  const first = c.ruling;
  const loser = first === "RESPONDENT" ? A : B;
  const other = loser === A ? B : A;
  await run.write("appeal by the losing party (then nobody runs rule_appeal)", loser, "appeal", [id, "Appealing in order to test what happens when the appeal round is never completed.", ""]);
  c = await caseOf(id);
  const balLoser = await bal(loser), balOther = await bal(other);
  if (name === "registered") {
    await run.write("register_appeal_attempt", loser, "register_appeal_attempt", [id]);
    c = await caseOf(id);
    run.check("attempt recorded on-chain and grace added to the deadline", c.appeal_attempts === 1 && c.appeal_due === c.appealed_at + 60 + 600, { attempts: c.appeal_attempts, due: c.appeal_due });
  }
  await waitUntil(c.appeal_due);
  await run.write("rule_appeal after the deadline reverts", A, "rule_appeal", [id], { expectFail: true });
  await run.write("expire (anyone applies the finality rules)", other, "expire", [id]);
  c = await caseOf(id);
  const want = name === "registered" ? "SPLIT" : "FORFEITED";
  run.check("first ruling stands and is FINAL (case NOT voided)", c.status === "FINAL" && c.ruling === first && c.appeal_result === "UNRESOLVED" && c.void_reason === "", { first, ruling: c.ruling, status: c.status, appeal_result: c.appeal_result });
  run.check(`bond outcome ${want}`, c.appeal_bond_outcome === want, c.appeal_bond_outcome);
  const dLoser = (await bal(loser)) - balLoser, dOther = (await bal(other)) - balOther;
  const pot = 100, bond = 100;
  const expOther = (first === "INCONCLUSIVE" ? 50 : first === (other === A ? "CLAIMANT" : "RESPONDENT") ? pot : 0) + (want === "SPLIT" ? 50 : bond);
  const expLoser = (first === "INCONCLUSIVE" ? 50 : 0) + (want === "SPLIT" ? 50 : 0);
  run.check("payout follows the FIRST ruling; the loser did not escape", dOther === expOther && dLoser === expLoser, { dLoser, dOther, expLoser, expOther, first });
} else if (name === "overlap") {
  const REPORT = RAW + "overlap/report", FINAL = RAW + "overlap/report-final", NOTE = RAW + "overlap/vendor-note";
  const id = await fileAndAnswer("Orbit Hosting service credit for missed uptime", [REPORT], [NOTE], { relief: "Orbit Hosting pays the 30 point service credit", stake: 50 },
    "Orbit Hosting missed three uptime targets in the quarter and the quarterly audit report confirms the penalty clause, so the customer is owed a service credit of 30 points.",
    "Credits are owed only after a FINAL audit report confirms that a penalty applies.");
  let c = await caseOf(id);
  const appellant = c.ruling === "CLAIMANT" ? B : A;
  await run.write(`appeal adds ${FINAL.slice(-12)} with a fragment (path overlaps the admitted /report)`, appellant, "appeal",
    [id, "The final audit report supersedes the draft that the first round used.", FINAL + "#penalties"]);
  c = await caseOf(id);
  run.check("overlapping path stored as its own exhibit, fragment stripped", c.appeal_evidence.length === 1 && c.appeal_evidence[0] === FINAL, c.appeal_evidence);
  const snaps = await read("get_snapshots", [id]);
  run.check("appeal exhibit snapshotted separately", snaps.filter((s) => s.who === "APPELLANT EXTRA" && s.url === FINAL).length === 1 && snaps.every((s) => /^[0-9a-f]{64}$/.test(s.sha256)), snaps.map((s) => [s.who, s.url.slice(-14), s.truncated]));
  await run.write("rule_appeal", A, "rule_appeal", [id]);
  const ev = await read("get_evidence", [id]);
  run.check("round two evidence list contains report AND report-final", ev[1].sources.includes(REPORT) && ev[1].sources.includes(FINAL) && ev[1].sources.length === 3, ev[1].sources);
  c = await caseOf(id);
  console.log(`[${name}] first ${c.first_ruling} final ${c.ruling} appeal ${c.appeal_result}`);
  run.check("case FINAL", c.status === "FINAL", { first: c.first_ruling, final: c.ruling, appeal: c.appeal_result, quote: ev[1].evidence_quote });
} else if (name === "concurrent") {
  const C = run.actor("C"), D = run.actor("D");
  await run.start(C, D);
  const pairs = [[A, B], [B, A], [C, D], [D, C]];
  const before = (await read("get_stats")).cases;
  const results = await Promise.all(pairs.map(([who, resp], i) => file(run, who, resp, `Concurrent filing ${who.label}-${Date.now() % 100000}`, EIFFEL_CLAIM, [EIFFEL], { stake: 20, rw: 900 })));
  const ids = results.map(idOf);
  run.check("every filing returned an id", ids.every(Number.isInteger), ids);
  run.check("ids are distinct", new Set(ids).size === ids.length, ids);
  run.check("ids are fresh (>= case count before the burst)", ids.every((i) => i >= before), { before, ids });
  for (let i = 0; i < pairs.length; i++) {
    const c = await caseOf(ids[i]);
    const mine = (await read("get_cases_by_filer", [pairs[i][0].address, 0, 1])).items[0];
    run.check(`wallet ${pairs[i][0].label}: returned id ${ids[i]} is its own case (claimant + title) and its newest filed case`,
      c.claimant === pairs[i][0].address && c.title.includes(`filing ${pairs[i][0].label}-`) && mine?.id === ids[i], { id: ids[i], claimant: c.claimant === pairs[i][0].address });
  }
} else {
  throw new Error("unknown scenario " + name);
}
run.doc.balances = { A: [startA, await bal(A)], B: [startB, await bal(B)] };
run.doc.stats = await read("get_stats");
run.save();
await run.finalizeAll();
