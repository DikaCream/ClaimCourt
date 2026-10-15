// Shared helpers for the Node scripts (deploy + e2e). Loads the wallet from .env.
import "dotenv/config";
import { createAccount, createClient, generatePrivateKey } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

export function getClient({ withAccount = true } = {}) {
  const endpoint = process.env.GENLAYER_RPC_URL || "https://studio.genlayer.com/api";
  const config = { chain: studionet, endpoint };
  if (withAccount) {
    const pk = process.env.PRIVATE_KEY;
    if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) {
      throw new Error("PRIVATE_KEY missing in .env - run `npm run wallet:new` first");
    }
    config.account = createAccount(pk);
  }
  return createClient(config);
}

// A throwaway in-memory wallet (never written to disk or printed). Studionet is gasless.
export function getEphemeralClient() {
  const endpoint = process.env.GENLAYER_RPC_URL || "https://studio.genlayer.com/api";
  return createClient({ chain: studionet, endpoint, account: createAccount(generatePrivateKey()) });
}

// Studio's "readable" return payload is JSON-like but may omit commas; pull scalar fields out of it.
export function parseReadable(readable) {
  const out = {};
  if (typeof readable !== "string") return out;
  for (const m of readable.matchAll(/"(\w+)"\s*:\s*("(?:[^"\\]|\\.)*"|-?\d+|true|false)/g)) {
    const raw = m[2];
    out[m[1]] = raw.startsWith('"') ? JSON.parse(raw) : raw === "true" ? true : raw === "false" ? false : Number(raw);
  }
  return out;
}

// Recursively converts Maps / BigInts returned by genlayer-js into plain JSON-friendly values.
export function toPlain(value) {
  if (value instanceof Map) {
    const obj = {};
    for (const [k, v] of value.entries()) obj[String(k)] = toPlain(v);
    return obj;
  }
  if (Array.isArray(value)) return value.map(toPlain);
  if (typeof value === "bigint") return Number(value);
  if (value && typeof value === "object" && value.constructor === Object) {
    const obj = {};
    for (const [k, v] of Object.entries(value)) obj[k] = toPlain(v);
    return obj;
  }
  return value;
}

export const EXPLORER_URL = "https://explorer-studio.genlayer.com";

// Waits for a transaction to reach ACCEPTED (or FINALIZED) and summarizes the outcome.
// Studio returns its raw transaction format, so success is derived from the leader receipt
// (execution_result === "SUCCESS") or, on newer backends, txExecutionResultName.
export async function waitAndInspect(client, hash, { retries = 120, interval = 5000 } = {}) {
  await client.waitForTransactionReceipt({ hash, status: "ACCEPTED", retries, interval });
  const tx = await client.getTransaction({ hash });
  const leaderReceipts = tx.consensus_data?.leader_receipt;
  const leader = Array.isArray(leaderReceipts) ? leaderReceipts[0] : leaderReceipts;
  const executionOk =
    tx.txExecutionResultName === "FINISHED_WITH_RETURN" || leader?.execution_result === "SUCCESS";
  const statusOk = ["ACCEPTED", "FINALIZED"].includes(tx.statusName);
  return {
    hash,
    statusName: tx.statusName,
    consensusResult: tx.result_name,
    executionResult: tx.txExecutionResultName ?? leader?.execution_result,
    success: statusOk && executionOk,
    returnValue: leader?.result?.payload?.readable,
    stderr: leader?.genvm_result?.stderr,
    contractAddress: tx.data?.contract_address ?? tx.txDataDecoded?.contractAddress ?? tx.recipient,
    tx,
  };
}
