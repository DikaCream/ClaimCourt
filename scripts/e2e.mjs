// Real end-to-end run of ClaimCourt on Studionet with two wallets.
// Wallet A = PRIVATE_KEY (deployer / claimant), wallet B = PRIVATE_KEY_2 (respondent).
// Paths covered: frivolous rejection, file -> respond -> rule -> appeal (overturn or upheld),
// file -> respond -> rule -> finalize, no-response timeout, ruling timeout, appeal timeout.
// Writes deployments/e2e-studionet.json.
import { readFileSync, writeFileSync } from "node:fs";
import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { getClient, toPlain, waitAndInspect, EXPLORER_URL } from "./lib.mjs";

const { contractAddress: address } = JSON.parse(readFileSync(new URL("../deployments/studionet.json", import.meta.url)));
const A = getClient();
if (!/^0x[0-9a-fA-F]{64}$/.test(process.env.PRIVATE_KEY_2 || "")) throw new Error("PRIVATE_KEY_2 missing in .env");
const B = createClient({ chain: studionet, endpoint: "https://studio.genlayer.com/api", account: createAccount(process.env.PRIVATE_KEY_2) });
const W = { A: A.account.address, B: B.account.address };
const steps = [];
const checks = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Math.floor(Date.now() / 1000);
const read = async (fn, args = []) => toPlain(await A.readContract({ address, functionName: fn, args }));

async function write(label, who, fn, args, { expectFail = false } = {}) {
  const c = who === "A" ? A : B;
  const t = Date.now();
  let hash, out;
  try {
    hash = await c.writeContract({ address, functionName: fn, args, value: 0n });
    out = await waitAndInspect(c, hash, { retries: 200, interval: 4000 });
  } catch (e) {
    out = { success: false, error: String(e.shortMessage || e.message).slice(0, 200) };
  }
  const ok = expectFail ? out.success !== true : out.success === true;
  steps.push({
    step: label, wallet: who, method: fn, tx: hash || null, explorer: hash ? `${EXPLORER_URL}/transactions/${hash}` : null,
    status: out.statusName || "REJECTED", execution: out.executionResult || "ERROR", ok,
    expected: expectFail ? "revert" : "success", seconds: Math.round((Date.now() - t) / 1000),
  });
  console.log(`${ok ? "OK  " : "FAIL"} ${label} [${out.statusName || "REJECTED"}/${out.executionResult || "ERROR"}] ${Math.round((Date.now() - t) / 1000)}s`);
  save();
  return out;
}

function check(label, cond, detail) {
  checks.push({ check: label, pass: !!cond, detail });
  console.log(`${cond ? "PASS" : "FAIL"} ${label}${detail !== undefined ? " -> " + JSON.stringify(detail) : ""}`);
}

function save(extra = {}) {
  writeFileSync(new URL("../deployments/e2e-studionet.json", import.meta.url),
    JSON.stringify({ network: "studionet", address, wallets: W, steps, checks, ...extra }, null, 2) + "\n");
}

const EIFFEL = "https://raw.githubusercontent.com/DikaCream/ClaimCourt/main/docs/evidence/e2e/tower-height.txt"; // stable fixture: live encyclopedia pages differ between validator fetches, so their snapshot hashes would not reach consensus
const CLAIM_TXT = "Respondent bet me 10 points that the Eiffel Tower in Paris is taller than 320 metres including its antennas, and refuses to pay although the public fact sheet states its current height.";
const STMT_C = "The fact sheet cited as my exhibit states a height of about 330 metres including antennas, which is more than 320 metres.";
const STMT_R = "I believe the tower is only 300 metres tall as originally built, so I do not owe the bet.";
const file = (title, urls, { rw = 300, rt = 900, aw = 60, at = 900, stake = 100 } = {}) =>
  write(`file: ${title}`, "A", "file_case", [title, CLAIM_TXT, "Respondent pays the 10 point bet", "OTHER", W.B, STMT_C, urls, stake, rw, rt, aw, at]);
const respond = (id) => write(`respond case ${id}`, "B", "respond", [id, STMT_R, [EIFFEL]]);
const total = async () => (await read("get_stats")).cases;

// ---- points
for (const w of ["A", "B"]) {
  const u = await read("get_user", [W[w]]);
  if (!u.claimed_start) await write(`claim_points (${w})`, w, "claim_points", []);
}
const startA = (await read("get_user", [W.A])).balance;
const startB = (await read("get_user", [W.B])).balance;

// ---- 1. frivolous / vague filing is rejected by the AI screen (no stake taken)
let id0 = await total();
await write("file frivolous case", "A", "file_case", ["Give me points please", "He is annoying and I just want some points for nothing at all really, whatever", "give me points", "OTHER", W.B,
  "He is just annoying and I feel like it, no concrete facts here at all.", ["https://example.com/"], 10, 300, 900, 60, 900]);
let c = await read("get_case", [id0]);
check("frivolous case rejected by AI screen", c.status === "REJECTED", { status: c.status, reason: c.reject_reason });

// ---- 2. start timeout cases early so their clocks run while the main path executes
const idNoResp = await total();
await file("Eiffel bet - no response case", [EIFFEL], { rw: 60 });
const idRuleTo = await total();
await file("Eiffel bet - ruling timeout case", [EIFFEL], { rt: 60 });
await respond(idRuleTo);
const respondedAt = now();

// ---- 3. main path: file -> respond -> rule -> appeal -> rule_appeal
const idMain = await total();
await file("Eiffel bet - full path", [EIFFEL], { aw: 600, at: 900 });
await respond(idMain);
const snaps = await read("get_snapshots", [idMain]);
check("evidence snapshot stored at filing + response (sha256 + excerpt per exhibit)", snaps.length === 2 && snaps.every((x) => /^[0-9a-f]{64}$/.test(x.sha256) && x.excerpt.length > 0),
  snaps.map((x) => ({ who: x.who, url: x.url, sha256: x.sha256, excerpt_chars: x.excerpt.length })));
await write("rule (AI validators read both sides' evidence)", "A", "rule", [idMain]);
c = await read("get_case", [idMain]);
const ev1 = await read("get_evidence", [idMain]);
console.log("ruling:", c.ruling, ev1[0]?.evidence_quote);
check("unchanged evidence is not flagged as changed", c.evidence_changed === false && ev1[0].evidence_changed.length === 0, { evidence_changed: c.evidence_changed });
check("ruling issued with quote + reasoning", c.status === "RULED" && ["CLAIMANT", "RESPONDENT", "INCONCLUSIVE"].includes(c.ruling) && ev1.length === 1 && ev1[0].reasoning.length > 0,
  { ruling: c.ruling, quote: ev1[0]?.evidence_quote, source: ev1[0]?.source_url });
const prevailing = c.ruling === "CLAIMANT" ? "A" : c.ruling === "RESPONDENT" ? "B" : null;
const appellant = prevailing === "A" ? "B" : "A";
await write("appeal by prevailing party reverts", prevailing || "A", "appeal", [idMain, "I won the first round but appeal anyway to test the guard.", ""], { expectFail: prevailing !== null });
await write(`appeal by ${appellant} (bond 100)`, appellant, "appeal", [idMain, "Please re-examine the fact sheet; the first ruling misread the stated height of the tower.", EIFFEL + "#height"]);
await write("rule_appeal (stricter second round)", "A", "rule_appeal", [idMain]);
c = await read("get_case", [idMain]);
const ev2 = await read("get_evidence", [idMain]);
check("appeal bond outcome is consistent", c.appeal_bond_outcome === (c.appeal_result === "UPHELD" && c.first_ruling !== "INCONCLUSIVE" ? "FORFEITED" : "RETURNED"), { first: c.first_ruling, result: c.appeal_result, bond: c.appeal_bond_outcome });
check("appeal settled case", c.status === "FINAL" && ["OVERTURNED", "UPHELD"].includes(c.appeal_result) && ev2.length === 2, { ruling: c.ruling, appeal: c.appeal_result });

// ---- 4. second full case without appeal: wait for the window, finalize
const idPlain = await total();
await file("Eiffel bet - no appeal case", [EIFFEL], { aw: 60 });
await respond(idPlain);
await write("rule (no-appeal case)", "A", "rule", [idPlain]);
c = await read("get_case", [idPlain]);
const wait = c.appeal_ends - now() + 5;
if (wait > 0) { console.log(`waiting ${wait}s for appeal window`); await sleep(wait * 1000); }
await write("finalize after appeal window", "B", "finalize", [idPlain]);
c = await read("get_case", [idPlain]);
check("case finalized after window", c.status === "FINAL", { ruling: c.ruling });

// ---- 5. timeouts
let cc = await read("get_case", [idNoResp]);
const waitNr = cc.respond_by - now() + 5;
if (waitNr > 0) await sleep(waitNr * 1000);
await write("expire no-response case", "B", "expire", [idNoResp]);
cc = await read("get_case", [idNoResp]);
check("no-response timeout voids + refunds claimant", cc.status === "VOID" && cc.void_reason === "NO_RESPONSE", { reason: cc.void_reason });

cc = await read("get_case", [idRuleTo]);
const waitRt = cc.ruling_due - now() + 5;
if (waitRt > 0) await sleep(waitRt * 1000);
await write("rule after ruling deadline reverts", "A", "rule", [idRuleTo], { expectFail: true });
await write("expire ruling-timeout case", "B", "expire", [idRuleTo]);
cc = await read("get_case", [idRuleTo]);
check("ruling timeout voids + refunds both", cc.status === "VOID" && cc.void_reason === "RULING_TIMEOUT", { reason: cc.void_reason });

// appeal timeout: appeal a ruling, never run the second round, expire after the deadline
const idAppTo = await total();
await file("Eiffel bet - appeal timeout case", [EIFFEL], { aw: 600, at: 60 });
await respond(idAppTo);
await write("rule (appeal-timeout case)", "A", "rule", [idAppTo]);
cc = await read("get_case", [idAppTo]);
const who2 = cc.ruling === "CLAIMANT" ? "B" : "A";
await write(`appeal by ${who2}`, who2, "appeal", [idAppTo, "Appealing in order to test that an abandoned appeal cannot hang the case.", ""]);
cc = await read("get_case", [idAppTo]);
const waitAt = cc.appeal_due - now() + 5;
if (waitAt > 0) await sleep(waitAt * 1000);
await write("rule_appeal after deadline reverts", "A", "rule_appeal", [idAppTo], { expectFail: true });
await write("expire appeal-timeout case", "B", "expire", [idAppTo]);
cc = await read("get_case", [idAppTo]);
check("appeal timeout voids + refunds stakes and bond", cc.status === "VOID" && cc.void_reason === "APPEAL_TIMEOUT", { reason: cc.void_reason });

// ---- conservation: points never created or lost except the forfeited bond moving between parties
const endA = (await read("get_user", [W.A])).balance;
const endB = (await read("get_user", [W.B])).balance;
check("points conserved between the two wallets", endA + endB === startA + startB, { startA, startB, endA, endB });

save({
  cases: { frivolous: id0, noResponse: idNoResp, rulingTimeout: idRuleTo, fullPath: idMain, plain: idPlain, appealTimeout: idAppTo },
  evidence: { fullPath: await read("get_evidence", [idMain]), plain: await read("get_evidence", [idPlain]) },
  stats: await read("get_stats"),
});
const failed = steps.filter((s) => !s.ok).length + checks.filter((k) => !k.pass).length;
console.log(failed === 0 ? "E2E PASSED" : `E2E FAILED (${failed})`);
process.exit(failed === 0 ? 0 : 1);
