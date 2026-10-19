// Shared helpers for the corrected-workflow Studionet runs (scripts/e2e-v2.mjs, scripts/browser-demo.mjs).
// Actors are throwaway in-memory wallets (Studionet is gasless): no key is ever written to disk or printed.
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { createAccount, createClient, generatePrivateKey } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { toPlain, waitAndInspect, parseReadable, EXPLORER_URL } from "./lib.mjs";

export const RPC = process.env.GENLAYER_RPC_URL || "https://studio.genlayer.com/api";
export const ADDRESS = process.env.CONTRACT_ADDRESS ||
  JSON.parse(readFileSync(new URL("../deployments/studionet.json", import.meta.url))).contractAddress;
export const RAW = "https://raw.githubusercontent.com/DikaCream/ClaimCourt/main/docs/evidence/";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const now = () => Math.floor(Date.now() / 1000);

export const reader = createClient({ chain: studionet, endpoint: RPC });
export const read = async (fn, args = []) => toPlain(await reader.readContract({ address: ADDRESS, functionName: fn, args }));

export class Run {
  constructor(name) {
    this.name = name;
    this.doc = { scenario: name, network: "studionet", chainId: 61999, contract: ADDRESS, startedAt: new Date().toISOString(), actors: {}, steps: [], checks: [] };
    this.out = new URL(`../deployments/e2e-v2-${name}.json`, import.meta.url);
  }
  actor(label, pk = generatePrivateKey()) {
    const account = createAccount(pk);
    const client = createClient({ chain: studionet, endpoint: RPC, account });
    this.doc.actors[label] = account.address;
    return { label, client, address: account.address };
  }
  save() { writeFileSync(this.out, JSON.stringify(this.doc, null, 2) + "\n"); }
  async write(label, who, fn, args, { expectFail = false } = {}) {
    const t = Date.now();
    let hash, out;
    try {
      hash = await who.client.writeContract({ address: ADDRESS, functionName: fn, args, value: 0n });
      out = await waitAndInspect(who.client, hash, { retries: 300, interval: 4000 });
    } catch (e) { out = { success: false, error: String(e.shortMessage || e.message).slice(0, 200) }; }
    const ok = expectFail ? out.success !== true : out.success === true;
    const values = parseReadable(out.returnValue);
    const step = { step: label, actor: who.label, method: fn, tx: hash || null, explorer: hash ? `${EXPLORER_URL}/transactions/${hash}` : null,
      status: out.statusName || "REJECTED", execution: out.executionResult || "ERROR", ok, expected: expectFail ? "revert" : "success",
      returned_id: values.id ?? null, seconds: Math.round((Date.now() - t) / 1000) };
    this.doc.steps.push(step);
    console.log(`[${this.name}] ${ok ? "OK  " : "FAIL"} ${label} [${step.status}/${step.execution}] ${step.seconds}s`);
    this.save();
    return { ...out, values, step };
  }
  check(label, pass, detail) {
    this.doc.checks.push({ check: label, pass: !!pass, detail });
    console.log(`[${this.name}] ${pass ? "PASS" : "FAIL"} ${label}${detail !== undefined ? " -> " + JSON.stringify(detail).slice(0, 300) : ""}`);
    this.save();
  }
  async start(...actors) {
    for (const a of actors) {
      const u = await read("get_user", [a.address]);
      if (!u.claimed_start) await this.write(`claim_points (${a.label})`, a, "claim_points", []);
    }
  }
  // Waits until every successful tx of this run reached FINALIZED (the authoritative state) and records it.
  async finalizeAll(maxMinutes = 25) {
    const deadline = Date.now() + maxMinutes * 60_000;
    for (const s of this.doc.steps) {
      if (!s.tx || !s.ok) continue;
      while (Date.now() < deadline) {
        const tx = await reader.getTransaction({ hash: s.tx }).catch(() => null);
        if (tx?.statusName) s.final_status = tx.statusName;
        if (tx?.statusName === "FINALIZED") break;
        await sleep(15000);
      }
    }
    this.doc.finishedAt = new Date().toISOString();
    this.doc.all_finalized = this.doc.steps.filter((s) => s.tx && s.ok).every((s) => s.final_status === "FINALIZED");
    this.doc.all_checks_pass = this.doc.checks.every((c) => c.pass) && this.doc.steps.every((s) => s.ok);
    this.save();
    console.log(`[${this.name}] finalized=${this.doc.all_finalized} checks=${this.doc.all_checks_pass}`);
  }
}

export const file = (run, who, resp, title, claim, urls, o = {}) =>
  run.write(`file: ${title}`, who, "file_case", [title, claim, o.relief || "Respondent pays the 10 point bet", "OTHER", resp.address,
    o.statement || "The exhibit I cite states the fact I rely on in plain words.", urls, o.stake ?? 50, o.rw ?? 600, o.rt ?? 900, o.aw ?? 600, o.at ?? 900]);

export const EIFFEL = RAW + "e2e/tower-height.txt";
export const EIFFEL_CLAIM = "Respondent bet me 10 points that the Eiffel Tower in Paris is taller than 320 metres including its antennas, and refuses to pay although the public fact sheet states its current height.";
export const EIFFEL_STMT_R = "I believe the tower is only 300 metres tall as originally built, so I do not owe the bet.";
export const OVERTURN = (v, k) => RAW + `overturn/${v}-${k}.txt`;
