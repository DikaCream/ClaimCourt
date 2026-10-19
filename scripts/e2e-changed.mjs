// On-chain Studionet scenario: EVIDENCE CHANGED AFTER THE SNAPSHOT (bait and switch), against the current contract.
//   node scripts/e2e-changed.mjs file   # snapshots both exhibits (respondent note is version 1)
//   ... edit docs/evidence/switch/respondent-note.txt on GitHub main to version 2, wait until raw.githubusercontent serves it ...
//   node scripts/e2e-changed.mjs rule   # validators must judge the STORED full-text snapshot and flag the change
// Uses PRIVATE_KEY / PRIVATE_KEY_2 from .env (never committed). Result: deployments/e2e-v2-changed.json
import { readFileSync, existsSync } from "node:fs";
import { Run, read, file, RAW, ADDRESS } from "./e2e-lib.mjs";

const phase = process.argv[2];
const run = new Run("changed");
if (phase === "rule" && existsSync(run.out)) run.doc = JSON.parse(readFileSync(run.out));
const A = run.actor("A", process.env.PRIVATE_KEY), B = run.actor("B", process.env.PRIVATE_KEY_2);
const EV_C = RAW + "switch/claimant-order-log.txt", EV_R = RAW + "switch/respondent-note.txt";

if (phase === "file") {
  await run.start(A, B);
  const f = await file(run, A, B, "Sticker order 4417 not delivered (switch)",
    "Studio Lanna promised delivery of order 4417 by 2026-10-01 and its order log says the 50 point deposit is refunded in full if the order is late. The log shows the order was not delivered.",
    [EV_C], { relief: "Respondent refunds the 50 point deposit", stake: 50, statement: "The studio's own order log shows order 4417 is late and carries a refund policy." });
  const id = f.values.id;
  run.doc.caseId = id;
  const c = await read("get_case", [id]);
  run.check("filing accepted", c.status === "AWAITING_RESPONSE", c.reject_reason);
  await run.write("respond (version-1 note)", B, "respond", [id, "Delivery dates are only estimates and refunds are handled case by case.", [EV_R]]);
  const snaps = await read("get_snapshots", [id]);
  run.check("snapshots stored with sha256, full-text excerpt and truncated flag", snaps.length === 2 && snaps.every((s) => /^[0-9a-f]{64}$/.test(s.sha256) && s.excerpt.length > 0 && s.truncated === false), snaps.map((s) => ({ url: s.url, sha256: s.sha256 })));
  run.doc.snapshots = snaps;
  run.save();
  console.log("Case", id, "ready: now switch the respondent note to version 2");
} else if (phase === "rule") {
  const id = run.doc.caseId;
  const live = await (await fetch(EV_R + "?nocache=" + Date.now())).text();
  run.check("respondent page now differs from the snapshot (version 2 is live)", /version 2/.test(live), live.slice(0, 80));
  await run.write("rule (validators compare live pages with the stored snapshot)", A, "rule", [id]);
  const c = await read("get_case", [id]);
  const ev = await read("get_evidence", [id]);
  run.check("ruling flagged evidence_changed, respondent exhibit listed", c.evidence_changed === true && ev[0]?.evidence_changed?.includes(EV_R), { flagged: c.evidence_changed, listed: ev[0]?.evidence_changed });
  run.check("edited page did not win: ruling is not RESPONDENT", c.ruling !== "RESPONDENT", { ruling: c.ruling, quote: ev[0]?.evidence_quote });
  run.check("decisive quote (if any) is from the stored snapshot, not the edited page", !ev[0]?.evidence_quote || !/version 2|signed for|SYSTEM/i.test(ev[0].evidence_quote), ev[0]?.evidence_quote);
  run.doc.case = c; run.doc.rounds = ev;
  await run.finalizeAll();
  process.exit(run.doc.all_checks_pass ? 0 : 1);
} else console.log("usage: node scripts/e2e-changed.mjs file|rule");
