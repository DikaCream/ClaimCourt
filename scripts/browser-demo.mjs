// BROWSER-ORIGINATED end-to-end demonstration against the live frontend.
// A headless Chrome drives the real UI (case filing, response, ruling, appeal, settlement) with an injected
// EIP-1193 provider. The provider is a thin bridge: every signing request is forwarded to THIS Node process,
// which signs with the test wallet key from .env (PRIVATE_KEY / PRIVATE_KEY_2). Keys never enter the page.
// Two browser contexts: claimant (wallet 1) and respondent (wallet 2).
// Usage: DEMO_URL=https://claimcourt-dikacreams-projects.vercel.app node scripts/browser-demo.mjs
// Writes deployments/browser-demo.json (tx hashes read FROM THE UI) and docs/demo-*.png (local only).
import "dotenv/config";
import { chromium } from "playwright-core";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { read, RAW, EIFFEL, EIFFEL_CLAIM, EIFFEL_STMT_R, ADDRESS } from "./e2e-lib.mjs";

const URL_BASE = (process.env.DEMO_URL || "https://claimcourt-dikacreams-projects.vercel.app").replace(/\/$/, "");
const RPC = process.env.GENLAYER_RPC_URL || "https://studio.genlayer.com/api";
const EXPLORER = "https://explorer-studio.genlayer.com/transactions/";
const keys = { claimant: process.env.PRIVATE_KEY, respondent: process.env.PRIVATE_KEY_2 };
if (!keys.claimant || !keys.respondent) throw new Error("PRIVATE_KEY and PRIVATE_KEY_2 are required in .env");
const doc = { demo: "browser-originated workflow", site: URL_BASE, contract: ADDRESS, startedAt: new Date().toISOString(), wallets: {}, steps: [], checks: [], rpcMethodsSeenByNodeSigner: {} };
const save = () => writeFileSync(new URL("../deployments/browser-demo.json", import.meta.url), JSON.stringify(doc, null, 2) + "\n");
mkdirSync(new URL("../docs/", import.meta.url), { recursive: true });

async function rpc(method, params) {
  const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }) });
  const j = await r.json();
  if (j.error) throw new Error(JSON.stringify(j.error));
  return j.result;
}

// Node-side wallet: the page can only ask; signing happens here.
function wallet(pk, label) {
  const account = privateKeyToAccount(pk);
  doc.wallets[label] = account.address;
  return async (method, params = []) => {
    doc.rpcMethodsSeenByNodeSigner[method] = (doc.rpcMethodsSeenByNodeSigner[method] || 0) + 1;
    switch (method) {
      case "eth_requestAccounts": case "eth_accounts": return [account.address];
      case "eth_chainId": return "0xf22f";
      case "wallet_switchEthereumChain": case "wallet_addEthereumChain": return null;
      case "eth_sendTransaction": {
        const t = params[0];
        const nonce = t.nonce !== undefined ? Number(BigInt(t.nonce)) : Number(BigInt(await rpc("eth_getTransactionCount", [account.address, "pending"])));
        const raw = await account.signTransaction({
          type: "legacy", to: t.to, data: t.data, value: t.value ? BigInt(t.value) : 0n, gas: BigInt(t.gas || "0x1e8480"),
          nonce, gasPrice: t.gasPrice ? BigInt(t.gasPrice) : 0n, chainId: 61999,
        });
        return rpc("eth_sendRawTransaction", [raw]);
      }
      default: return rpc(method, params);
    }
  };
}

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
async function session(label, pk) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1600 } });
  const handler = wallet(pk, label);
  const page = await ctx.newPage();
  await page.exposeFunction("__ccWallet", handler);
  await page.addInitScript(() => {
    window.ethereum = { isMetaMask: true, request: ({ method, params }) => window.__ccWallet(method, params ?? []), on() {}, removeListener() {} };
  });
  page.on("pageerror", (e) => console.log(`[${label}] pageerror`, String(e).slice(0, 160)));
  return { label, page, ctx, address: handler && doc.wallets[label] };
}
const shot = (s, name) => s.page.screenshot({ path: new URL(`../docs/demo-${name}.png`, import.meta.url).pathname, fullPage: false }).catch(() => {});

// Waits for the UI's clerk log to report FINALIZED+verified, and reads the transaction hash from the UI.
async function uiAction(s, label, trigger) {
  const t = Date.now();
  await trigger();
  const log = s.page.locator('[data-testid="clerk-log"]').first();
  await log.waitFor({ timeout: 60_000 });
  const outcome = await s.page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="clerk-log"]');
    const txt = el?.textContent || "";
    if (/Finalized and verified/.test(txt)) return "OK";
    if (/Rejected:|Validators could not agree|not on-chain|Not finalized yet/.test(txt)) return "FAIL: " + txt.slice(0, 300);
    return false;
  }, null, { timeout: 25 * 60_000, polling: 3000 }).then((h) => h.jsonValue());
  const href = await log.locator('a[href*="/transactions/"]').first().getAttribute("href").catch(() => null);
  const hash = href ? href.split("/transactions/")[1] : null;
  const step = { step: label, actor: s.label, tx_from_ui: hash, explorer: hash ? EXPLORER + hash : null, ui_outcome: outcome, seconds: Math.round((Date.now() - t) / 1000) };
  doc.steps.push(step);
  console.log(`${outcome === "OK" ? "OK  " : "FAIL"} ${label} ${hash} ${step.seconds}s`);
  save();
  if (outcome !== "OK") throw new Error(`${label}: ${outcome}`);
  return hash;
}
const check = (label, pass, detail) => { doc.checks.push({ check: label, pass: !!pass, detail }); console.log(pass ? "PASS" : "FAIL", label, detail ? JSON.stringify(detail).slice(0, 200) : ""); save(); };

async function connect(s) {
  await s.page.goto(URL_BASE + "/", { waitUntil: "networkidle" });
  // the injected provider already exposes the account (eth_accounts), so the app auto-connects; click only if offered
  const signIn = s.page.getByRole("button", { name: /Sign in with MetaMask/ });
  if (await signIn.waitFor({ timeout: 4000 }).then(() => true).catch(() => false)) await signIn.click();
  await s.page.getByText(/pts$/).first().waitFor({ timeout: 60_000 }).catch(() => {});
}

try {
  const A = await session("claimant", keys.claimant);
  const B = await session("respondent", keys.respondent);
  for (const s of [A, B]) await connect(s);
  await shot(A, "01-connected");

  for (const s of [A, B]) {
    const claimBtn = s.page.getByRole("button", { name: /^Claim .* pts$/ });
    await claimBtn.waitFor({ timeout: 30_000 }).catch(() => {});
    if (await claimBtn.count()) {
      await uiAction(s, `claim starting points (${s.label})`, () => claimBtn.click());
    }
  }

  // ---- file (claimant, via the form)
  const title = `Browser demo Eiffel bet ${Date.now() % 100000}`;
  const before = (await read("get_stats")).cases;
  await A.page.goto(URL_BASE + "/file", { waitUntil: "networkidle" });
  await A.page.getByPlaceholder("Late delivery of a website").fill(title);
  await A.page.getByPlaceholder(/The freelancer agreed in writing/).fill(EIFFEL_CLAIM);
  await A.page.getByPlaceholder("A 50 percent refund of the fee").fill("Respondent pays the 10 point bet");
  await A.page.getByPlaceholder("0x…").fill(B.address);
  await A.page.locator("input[type=number]").fill("50");
  await A.page.locator("textarea").nth(1).fill("The fact sheet cited as my exhibit states a height of about 330 metres including antennas, which is more than 320 metres.");
  await A.page.getByPlaceholder("https://…").first().fill(EIFFEL);
  const selects = A.page.locator("select");
  await selects.nth(3).selectOption("3600");   // appeal window 1 hour (so the appeal is filed in time)
  await selects.nth(4).selectOption("3600");   // appeal must be decided within 1 hour
  await shot(A, "02-file-form");
  let id = null;
  for (let attempt = 1; attempt <= 3 && id === null; attempt++) {
    await uiAction(A, `file case (attempt ${attempt})`, () => A.page.getByRole("button", { name: /Stamp & file/ }).click());
    await A.page.waitForURL(/\/case\/\d+/, { timeout: 60_000 });
    id = Number(A.page.url().match(/\/case\/(\d+)/)[1]);
    const c = await read("get_case", [id]);
    if (c.status !== "AWAITING_RESPONSE") { console.log("filing dismissed by the AI screen:", c.reject_reason); id = null; await A.page.goto(URL_BASE + "/file", { waitUntil: "networkidle" }); await A.page.getByPlaceholder("Late delivery of a website").fill(title + " r" + attempt); await selects.nth(3).selectOption("3600"); await selects.nth(4).selectOption("3600");
      await A.page.getByPlaceholder(/The freelancer agreed in writing/).fill(EIFFEL_CLAIM); await A.page.getByPlaceholder("A 50 percent refund of the fee").fill("Respondent pays the 10 point bet"); await A.page.getByPlaceholder("0x…").fill(B.address); await A.page.locator("input[type=number]").fill("50"); await A.page.locator("textarea").nth(1).fill("The fact sheet cited as my exhibit states a height of about 330 metres including antennas, which is more than 320 metres."); await A.page.getByPlaceholder("https://…").first().fill(EIFFEL); }
  }
  if (id === null) throw new Error("filing was dismissed three times");
  const filed = await read("get_case", [id]);
  check("UI navigated to the id returned by the filing transaction (not count-before)", filed.claimant === A.address && filed.title.startsWith(title.slice(0, 25)), { navigated_to: id, count_before: before, claimant: filed.claimant === A.address });
  await shot(A, "03-case-filed");

  // ---- respond (respondent, new context)
  await B.page.goto(`${URL_BASE}/case/${id}`, { waitUntil: "networkidle" });
  await B.page.getByPlaceholder("Your statement (min 20 characters)").fill(EIFFEL_STMT_R);
  await B.page.getByPlaceholder(/Exhibit R-1/).fill(EIFFEL);
  await uiAction(B, "respond (match stake)", () => B.page.getByRole("button", { name: /Match stake & answer/ }).click());

  // ---- adjudication (claimant calls the ruling)
  await A.page.goto(`${URL_BASE}/case/${id}`, { waitUntil: "networkidle" });
  await uiAction(A, "call the ruling", () => A.page.getByRole("button", { name: /Call the ruling/ }).click());
  let c = await read("get_case", [id]);
  const ev1 = await read("get_evidence", [id]);
  check("ruling stored with structured findings", ev1.length === 1 && ev1[0].findings.length >= 1, { ruling: c.ruling, findings: ev1[0].findings.length, decisive: ev1[0].decisive });
  await A.page.reload({ waitUntil: "networkidle" });
  await shot(A, "04-ruled");

  // ---- appeal (the losing party) and settlement
  const loser = c.ruling === "RESPONDENT" ? A : B;
  if (c.ruling === "RESPONDENT" || c.ruling === "CLAIMANT" || c.ruling === "INCONCLUSIVE") {
    const appellant = c.ruling === "CLAIMANT" ? B : A;
    await appellant.page.goto(`${URL_BASE}/case/${id}`, { waitUntil: "networkidle" });
    await appellant.page.getByPlaceholder(/Grounds of appeal/).fill("The first ruling should be re-examined: please re-read every exhibit under the stricter standard.");
    await uiAction(appellant, "file appeal (bond 100)", () => appellant.page.getByRole("button", { name: /File appeal/ }).click());
    await appellant.page.reload({ waitUntil: "networkidle" });
    await uiAction(appellant, "hear the appeal (settlement)", () => appellant.page.getByRole("button", { name: /Hear the appeal/ }).click());
    c = await read("get_case", [id]);
    check("case FINAL after the appeal, settled on-chain", c.status === "FINAL", { first: c.first_ruling, final: c.ruling, appeal: c.appeal_result, bond: c.appeal_bond_outcome });
    await appellant.page.reload({ waitUntil: "networkidle" });
    await shot(appellant, "05-settled");
  }
  doc.case = { id, final: await read("get_case", [id]), rounds: await read("get_evidence", [id]) };
  const stored = await A.page.evaluate(() => localStorage.getItem("claimcourt:txs:v1"));
  doc.uiPersistedTxRecords = JSON.parse(stored || "[]").map((r) => ({ method: r.method, state: r.state, hash: r.hash }));
  check("every UI action ended FINALIZED + verified", doc.steps.every((x) => x.ui_outcome === "OK"), doc.steps.length + " actions");
  check("private keys never present in the page", !(await A.page.content()).includes(keys.claimant.slice(2, 20)) && !(await B.page.content()).includes(keys.respondent.slice(2, 20)));
} catch (e) {
  console.error("DEMO FAILED:", e.message);
  doc.error = String(e.message).slice(0, 500);
  process.exitCode = 1;
} finally {
  doc.finishedAt = new Date().toISOString();
  save();
  await browser.close();
}
