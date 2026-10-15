// On-chain Studionet scenario: an appeal OVERTURNS the first ruling. Run: VARIANT=a|b node scripts/e2e-overturn.mjs
// Round 1: the respondent's courier log looks like proof of delivery -> expected RESPONDENT (or INCONCLUSIVE).
// Appeal: the claimant adds a courier correction notice showing the log entry belonged to another order -> the stricter round flips it.
// Evidence fixtures live in docs/evidence/overturn/. Appends to "overturnRuns" in deployments/e2e-studionet.json locally.
// Needs PRIVATE_KEY and PRIVATE_KEY_2 in .env (never committed).
import { readFileSync, writeFileSync } from "node:fs";
import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { getClient, toPlain, waitAndInspect, EXPLORER_URL } from "./lib.mjs";

const OUT = new URL("../deployments/e2e-studionet.json", import.meta.url);
const doc = JSON.parse(readFileSync(OUT));
const address = doc.address;
const A = getClient();
const B = createClient({ chain: studionet, endpoint: "https://studio.genlayer.com/api", account: createAccount(process.env.PRIVATE_KEY_2) });
const W = { A: A.account.address, B: B.account.address };
const RAW = "https://raw.githubusercontent.com/DikaCream/ClaimCourt/main/docs/evidence/overturn/";
const V = (process.env.VARIANT || "a").toLowerCase(); // a: log has no order number; b: log cites #4417 and the appeal proves a mistyped reference
const EV_C = RAW + V + "-claimant-invoice.txt", EV_R = RAW + V + "-respondent-delivery.txt", EV_X = RAW + V + "-appeal-correction.txt";
const steps = [];
const read = async (fn, args = []) => toPlain(await A.readContract({ address, functionName: fn, args }));
async function write(label, who, fn, args) {
  const c = who === "A" ? A : B;
  let hash, out;
  try { hash = await c.writeContract({ address, functionName: fn, args, value: 0n }); out = await waitAndInspect(c, hash, { retries: 200, interval: 4000 }); }
  catch (e) { out = { success: false, error: String(e.shortMessage || e.message).slice(0, 200) }; }
  steps.push({ step: label, wallet: who, method: fn, tx: hash || null, explorer: hash ? `${EXPLORER_URL}/transactions/${hash}` : null,
    status: out.statusName || "REJECTED", execution: out.executionResult || "ERROR", ok: out.success === true });
  console.log(out.success ? "OK  " : "FAIL", label, out.statusName, out.executionResult);
  return out;
}
const id = (await read("get_stats")).cases;
await write("file case (delivery dispute)", "A", "file_case", [
  "Sticker order 4417 never delivered, refund due",
  "Studio Lanna promised to deliver order #4417 (200 printed stickers) by 2026-10-01 and the order confirmation promises a refund of the 50 point deposit if it is late. The goods never arrived at my address.",
  "Respondent refunds the 50 point deposit", "SERVICE", W.B,
  "The work order log shows order 4417 was promised for 2026-10-01 with a refund policy for late delivery, and I never received the parcel.",
  [EV_C], 50, 300, 900, 600, 900]);
const c0 = await read("get_case", [id]);
if (c0.status !== "AWAITING_RESPONSE") { console.log("filing rejected", c0.status, c0.reject_reason); }
else {
  await write("respond (courier log as proof of delivery)", "B", "respond", [id, "The courier log shows the parcel was delivered on time on 2026-10-01 and signed for, so no refund is owed.", [EV_R]]);
  await write("rule (first round)", "A", "rule", [id]);
  let c = await read("get_case", [id]);
  const first = c.ruling;
  console.log("first ruling:", first);
  let result = { first_ruling: first };
  const appellant = first === "CLAIMANT" ? "B" : "A";
  await write(`appeal by ${appellant} with correction notice`, appellant, "appeal", [id,
    "The courier log entry has no reliable order number. The courier's own correction notice says it belonged to order 4418 and that order 4417 was returned undelivered.", EV_X]);
  await write("rule_appeal (stricter round)", "A", "rule_appeal", [id]);
  c = await read("get_case", [id]);
  result = { ...result, final_ruling: c.ruling, appeal_result: c.appeal_result, status: c.status };
  const ev = await read("get_evidence", [id]);
  const run = { variant: V, when: new Date().toISOString(), case_id: id, evidence_urls: { claimant: EV_C, respondent: EV_R, appeal_extra: EV_X }, ...result, steps, rounds: ev, stats: await read("get_stats") };
  const fresh = JSON.parse(readFileSync(OUT));
  fresh.overturnRuns = [...(fresh.overturnRuns || []), run];
  writeFileSync(OUT, JSON.stringify(fresh, null, 2) + "\n");
  console.log(JSON.stringify(result), ev.map((r) => r.kind + ":" + r.ruling + " | " + r.reasoning));
}
