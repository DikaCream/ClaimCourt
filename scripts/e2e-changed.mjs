// On-chain Studionet scenario: EVIDENCE CHANGED AFTER THE SNAPSHOT (bait and switch).
//   node scripts/e2e-changed.mjs file   # claimant files, respondent answers: validators snapshot both exhibits
//   ... then edit docs/evidence/changed/respondent-note.txt on GitHub main (version 2 claims delivery + injection text)
//       and wait until raw.githubusercontent.com serves version 2 (its CDN caches for ~5 minutes) ...
//   node scripts/e2e-changed.mjs rule   # anyone calls rule: validators must judge the STORED snapshot, flag the change
// State between phases: deployments/e2e-changed.state.json. Result: deployments/e2e-studionet-changed.json.
// Needs PRIVATE_KEY and PRIVATE_KEY_2 in .env (never committed).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { getClient, toPlain, waitAndInspect, EXPLORER_URL } from "./lib.mjs";

const { contractAddress: address } = JSON.parse(readFileSync(new URL("../deployments/studionet.json", import.meta.url)));
const STATE = new URL("../deployments/e2e-changed.state.json", import.meta.url);
const OUT = new URL("../deployments/e2e-studionet-changed.json", import.meta.url);
const A = getClient();
const B = createClient({ chain: studionet, endpoint: "https://studio.genlayer.com/api", account: createAccount(process.env.PRIVATE_KEY_2) });
const W = { A: A.account.address, B: B.account.address };
const RAW = "https://raw.githubusercontent.com/DikaCream/ClaimCourt/main/docs/evidence/changed/";
const EV_C = RAW + "claimant-order-log.txt", EV_R = RAW + "respondent-note.txt";
const phase = process.argv[2];
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE)) : { steps: [], checks: [] };
const { steps, checks } = state;
const read = async (fn, args = []) => toPlain(await A.readContract({ address, functionName: fn, args }));
async function write(label, who, fn, args) {
  const c = who === "A" ? A : B;
  let hash, out;
  try { hash = await c.writeContract({ address, functionName: fn, args, value: 0n }); out = await waitAndInspect(c, hash, { retries: 200, interval: 4000 }); }
  catch (e) { out = { success: false, error: String(e.shortMessage || e.message).slice(0, 200) }; }
  steps.push({ step: label, wallet: who, method: fn, tx: hash || null, explorer: hash ? `${EXPLORER_URL}/transactions/${hash}` : null,
    status: out.statusName || "REJECTED", execution: out.executionResult || "ERROR", ok: out.success === true });
  console.log(out.success ? "OK  " : "FAIL", label, out.statusName, out.executionResult);
  writeFileSync(STATE, JSON.stringify(state, null, 2) + "\n");
  return out;
}
function check(label, cond, detail) {
  checks.push({ check: label, pass: !!cond, detail });
  console.log(cond ? "PASS" : "FAIL", label, detail !== undefined ? JSON.stringify(detail) : "");
  writeFileSync(STATE, JSON.stringify(state, null, 2) + "\n");
}

if (phase === "file") {
  for (const w of ["A", "B"]) if (!(await read("get_user", [W[w]])).claimed_start) await write(`claim_points (${w})`, w, "claim_points", []);
  const id = (await read("get_stats")).cases;
  state.caseId = id;
  await write("file case (late sticker order)", "A", "file_case", [
    "Sticker order 4417 not delivered, refund due",
    "Studio Lanna promised to deliver order 4417 (200 printed stickers) by 2026-10-01 and its order log states the 50 point deposit is refunded in full if the order is late. The order log shows the order was not delivered.",
    "Respondent refunds the 50 point deposit", "SERVICE", W.B,
    "The studio's own order log shows order 4417 was promised for 2026-10-01, is still not delivered, and carries a full refund policy for late orders.",
    [EV_C], 50, 600, 3600, 600, 900]);
  await write("respond (answer with the version-1 note)", "B", "respond", [id, "Delivery dates are only estimates and refunds are handled case by case, so no automatic refund is owed.", [EV_R]]);
  const snaps = await read("get_snapshots", [id]);
  check("snapshots stored for both exhibits", snaps.length === 2 && snaps.every((s) => /^[0-9a-f]{64}$/.test(s.sha256) && s.excerpt.length > 0),
    snaps.map((s) => ({ who: s.who, url: s.url, sha256: s.sha256, excerpt: s.excerpt })));
  state.snapshots = snaps;
  writeFileSync(STATE, JSON.stringify(state, null, 2) + "\n");
  console.log("Case", id, "ready. Now edit respondent-note.txt on GitHub main, wait for raw.githubusercontent to serve v2, then run: node scripts/e2e-changed.mjs rule");
} else if (phase === "rule") {
  const id = state.caseId;
  const live = await (await fetch(EV_R + "?nocache=" + Date.now())).text();
  state.liveRespondentPageAtRuleTime = live;
  check("respondent page now differs from the snapshot (version 2 is live)", /version 2/.test(live), { head: live.slice(0, 80) });
  await write("rule (validators compare live pages with the stored snapshot)", "A", "rule", [id]);
  const c = await read("get_case", [id]);
  const ev = await read("get_evidence", [id]);
  check("ruling flagged evidence_changed with the respondent exhibit listed", c.evidence_changed === true && ev[0]?.evidence_changed?.includes(EV_R), { evidence_changed: c.evidence_changed, listed: ev[0]?.evidence_changed });
  check("edited page did not win: ruling is not RESPONDENT", c.ruling !== "RESPONDENT", { ruling: c.ruling, quote: ev[0]?.evidence_quote, source: ev[0]?.source_url });
  const snapTexts = (await read("get_snapshots", [id])).map((s) => s.excerpt.toLowerCase());
  check("quote (if any) comes from the stored snapshot, not from the edited page", !ev[0]?.evidence_quote || /delivered|refund|promised|estimates/i.test(ev[0].evidence_quote) && !/version 2|signed for|SYSTEM/i.test(ev[0].evidence_quote), { quote: ev[0]?.evidence_quote });
  writeFileSync(OUT, JSON.stringify({ network: "studionet", address, wallets: W, caseId: id, steps, checks, snapshots: state.snapshots, case: c, rounds: ev }, null, 2) + "\n");
  const failed = steps.filter((s) => !s.ok).length + checks.filter((k) => !k.pass).length;
  console.log(failed === 0 ? "CHANGED-EVIDENCE E2E PASSED" : `FAILED (${failed})`);
  process.exit(failed === 0 ? 0 : 1);
} else { console.log("usage: node scripts/e2e-changed.mjs file|rule"); }
