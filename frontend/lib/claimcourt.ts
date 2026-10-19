// Typed wrapper around the ClaimCourt intelligent contract using genlayer-js.
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import type { TransactionHash } from "genlayer-js/types";
import { CHAIN_ID, CONTRACT_ADDRESS, RPC_URL } from "./config";
import { ensureCorrectChain, type EthereumProvider } from "./wallet";

export type CaseStatus = "REJECTED" | "AWAITING_RESPONSE" | "READY" | "RULED" | "APPEALED" | "FINAL" | "VOID";
export type Ruling = "" | "CLAIMANT" | "RESPONDENT" | "INCONCLUSIVE";

/** Light row returned by registry pages (get_cases / get_user_cases / get_cases_by_filer). */
export interface CaseSummary {
  id: number;
  claimant: string;
  respondent: string;
  title: string;
  category: string;
  stake: number;
  pot: number;
  status: CaseStatus;
  void_reason: "" | "NO_RESPONSE" | "WITHDRAWN" | "RULING_TIMEOUT";
  ruling: Ruling;
  appeal_result: "" | "OVERTURNED" | "UPHELD" | "UNRESOLVED";
  filed_at: number;
  final_at: number;
  claimant_evidence: string[];
  role?: "CLAIMANT" | "RESPONDENT";
}

export interface CasePage {
  total: number;
  items: CaseSummary[];
  next_offset: number; // -1 = end of the index
  limit?: number;
}

export interface CourtCase {
  id: number;
  claimant: string;
  respondent: string;
  title: string;
  claim: string;
  relief: string;
  category: string;
  claimant_statement: string;
  claimant_evidence: string[];
  respondent_statement: string;
  respondent_evidence: string[];
  stake: number;
  pot: number;
  status: CaseStatus;
  reject_reason: string;
  void_reason: "" | "NO_RESPONSE" | "WITHDRAWN" | "RULING_TIMEOUT";
  filed_at: number;
  respond_by: number;
  responded_at: number;
  ruling_timeout: number;
  ruling_due: number;
  appeal_window: number;
  appeal_ends: number;
  appeal_open: boolean;
  appeal_timeout: number;
  appeal_due: number;
  ruling: Ruling;
  ruled_at: number;
  first_ruling: Ruling;
  appellant: string;
  appeal_reason: string;
  appeal_evidence: string[];
  appealed_at: number;
  appeal_result: "" | "OVERTURNED" | "UPHELD" | "UNRESOLVED";
  appeal_attempts: number;
  appeal_undetermined: number;
  appeal_grace_s: number;
  final_at: number;
  rounds: number;
  evidence_changed: boolean;
  snapshots: { url: string; sha256: string; excerpt_chars: number; truncated: boolean }[];
  appeal_bond_outcome: "" | "RETURNED" | "FORFEITED" | "SPLIT";
}

export interface Finding {
  exhibit: number;
  url: string;
  quote: string;
  fact: string;
  supports: "CLAIMANT" | "RESPONDENT" | "NEUTRAL";
}

export interface Round {
  kind: "INITIAL" | "APPEAL" | "APPEAL_UNDETERMINED" | "TIMEOUT";
  ruling: string;
  evidence_quote: string;
  source_url: string;
  reasoning: string;
  sources: string[];
  evidence_changed: string[];
  evidence_incomplete: string[];
  findings: Finding[];
  decisive: number;
  caller: string;
  timestamp: number;
}

export interface UserInfo {
  address: string;
  balance: number;
  claimed_start: boolean;
  cases: number;
  filed: number;
}

export interface Stats {
  cases: number;
  by_status: Record<CaseStatus, number>;
  users: number;
  total_staked: number;
  appeals: number;
  overturned: number;
}

// genlayer-js decodes contract dicts as Map and ints as bigint; normalize to plain JSON values.
export function toPlain(value: unknown): any {
  if (value instanceof Map) {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of value.entries()) obj[String(k)] = toPlain(v);
    return obj;
  }
  if (Array.isArray(value)) return value.map(toPlain);
  if (typeof value === "bigint") return Number(value);
  if (value && typeof value === "object" && (value as object).constructor === Object) {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) obj[k] = toPlain(v);
    return obj;
  }
  return value;
}

function requireAddress(): `0x${string}` {
  if (!CONTRACT_ADDRESS) throw new Error("NEXT_PUBLIC_CONTRACT_ADDRESS is not configured");
  return CONTRACT_ADDRESS;
}

const readClient = createClient({ chain: studionet, endpoint: RPC_URL });

async function read<T>(functionName: string, args: any[] = []): Promise<T> {
  const result = await readClient.readContract({ address: requireAddress(), functionName, args });
  return toPlain(result) as T;
}

export const getCases = (status: string, offset: number, limit: number) =>
  read<CasePage>("get_cases", [status, offset, limit]);
export const getUserCases = (user: string, offset: number, limit: number) =>
  read<CasePage>("get_user_cases", [user, offset, limit]);
export const getCasesByFiler = (user: string, offset: number, limit: number) =>
  read<CasePage>("get_cases_by_filer", [user, offset, limit]);
export const getCase = (id: number) => read<CourtCase>("get_case", [id]);
export const getEvidence = (id: number) => read<Round[]>("get_evidence", [id]);
export const getUser = (user: string) => read<UserInfo>("get_user", [user]);
export const getStats = () => read<Stats>("get_stats");

// ------------------------------------------------------------------ transactions

/** Consensus steps shown in the UI, in order (from the transaction's statusName). */
export const TX_STEPS = ["PENDING", "PROPOSING", "COMMITTING", "REVEALING", "ACCEPTED", "FINALIZED"] as const;
export const FAILED_STATUSES = new Set(["UNDETERMINED", "CANCELED", "LEADER_TIMEOUT", "VALIDATORS_TIMEOUT"]);
const FINALIZE_WAIT_MS = 25 * 60_000;

export interface TxCallbacks {
  onHash?: (hash: string) => void;
  onStatus?: (status: string) => void;
}

export interface TxResult {
  hash: string;
  statusName: string;
  values: Record<string, unknown>;
}

/** Called once the transaction is FINALIZED and successful: read the contract and return null if the
 *  expected state change is really there, or a message describing what is wrong. */
export type Verifier = (r: TxResult) => Promise<string | null>;

export interface TxOptions {
  /** Idempotency key: one in-flight transaction per key (e.g. "respond:3"). */
  key?: string;
  verify?: Verifier;
}

export class TxError extends Error {
  hash?: string;
  constructor(message: string, hash?: string) {
    super(message);
    this.hash = hash;
  }
}

/** Studio's "readable" return payload is JSON-like but may omit commas; extract scalar fields. */
export function parseReadable(readable: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (typeof readable !== "string") return out;
  for (const m of readable.matchAll(/"(\w+)"\s*:\s*("(?:[^"\\]|\\.)*"|-?\d+|true|false)/g)) {
    const raw = m[2];
    try {
      out[m[1]] = raw.startsWith('"') ? JSON.parse(raw) : raw === "true" ? true : raw === "false" ? false : Number(raw);
    } catch {
      out[m[1]] = raw.slice(1, -1);
    }
  }
  return out;
}

function cleanError(raw: unknown): string {
  const text = String(raw ?? "").trim();
  if (!text) return "The contract rejected the transaction";
  const quoted = text.match(/"([^"]{3,200})"/);
  return (quoted ? quoted[1] : text).slice(0, 200);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchTx(hash: string): Promise<any | null> {
  try {
    return await readClient.getTransaction({ hash: hash as TransactionHash });
  } catch {
    return null;
  }
}

// ---- persisted transaction records (localStorage) -------------------------------------------

export type TxRecordState = "SUBMITTED" | "ACCEPTED" | "CONFIRMED" | "FAILED" | "UNVERIFIED" | "UNCERTAIN";
export interface TxRecord {
  hash: string;
  key: string;
  method: string;
  author: string;
  state: TxRecordState;
  at: number;
  note?: string;
}
const STORE = "claimcourt:txs:v1";

export function loadTxRecords(): TxRecord[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(STORE) || "[]") as TxRecord[];
  } catch {
    return [];
  }
}
function saveTxRecord(rec: TxRecord) {
  if (typeof window === "undefined") return;
  const all = loadTxRecords().filter((r) => r.hash !== rec.hash);
  all.unshift(rec);
  window.localStorage.setItem(STORE, JSON.stringify(all.slice(0, 50)));
  window.dispatchEvent(new Event("claimcourt:txs"));
}
export function dismissTxRecord(hash: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORE, JSON.stringify(loadTxRecords().filter((r) => r.hash !== hash)));
  window.dispatchEvent(new Event("claimcourt:txs"));
}
/** A record that is still unresolved (so the same operation must not be signed a second time). */
export function pendingRecord(key: string, author: string): TxRecord | undefined {
  return loadTxRecords().find(
    (r) => r.key === key && r.author.toLowerCase() === author.toLowerCase() &&
      (r.state === "SUBMITTED" || r.state === "ACCEPTED" || r.state === "UNCERTAIN") && Date.now() - r.at < 60 * 60_000,
  );
}

// ---- wallet revalidation --------------------------------------------------------------------

/** Immediately before signing: the wallet's ACTIVE account must still be `author` and the chain must be 61999. */
async function revalidateWallet(author: string, provider: EthereumProvider) {
  let chain = parseInt(await provider.request({ method: "eth_chainId" }), 16);
  if (chain !== CHAIN_ID) {
    await ensureCorrectChain();
    chain = parseInt(await provider.request({ method: "eth_chainId" }), 16);
  }
  if (chain !== CHAIN_ID) throw new TxError(`Wrong network (chain ${chain}). Switch your wallet to GenLayer Studionet (${CHAIN_ID}) and retry.`);
  const accounts: string[] = await provider.request({ method: "eth_accounts" });
  if (!accounts[0] || accounts[0].toLowerCase() !== author.toLowerCase()) {
    throw new TxError("The active wallet account changed. Reconnect with the account you started with and retry.");
  }
}

/**
 * Polls a submitted transaction until it is FINALIZED (the only authoritative success), checks the leader
 * receipt, then lets `verify` confirm the resulting contract state. ACCEPTED is shown but is NOT success.
 */
export async function watchTx(
  hash: string, rec: TxRecord, cb: TxCallbacks, verify?: Verifier,
): Promise<TxResult> {
  let status = "PENDING";
  let tx: any = null;
  const deadline = Date.now() + FINALIZE_WAIT_MS;
  while (Date.now() < deadline) {
    await sleep(2500);
    const next = await fetchTx(hash);
    if (!next) continue;
    tx = next;
    const s = String(tx.statusName ?? status);
    if (s !== status) {
      status = s;
      cb.onStatus?.(s);
      if (s === "ACCEPTED") saveTxRecord({ ...rec, state: "ACCEPTED", at: Date.now() });
    }
    const receipts = tx?.consensus_data?.leader_receipt;
    const leader = Array.isArray(receipts) ? receipts[0] : receipts;
    if (FAILED_STATUSES.has(s)) {
      saveTxRecord({ ...rec, state: "FAILED", note: s, at: Date.now() });
      throw new TxError(`Validators could not agree (status: ${s}). Nothing was recorded.`, hash);
    }
    if (leader?.execution_result && leader.execution_result !== "SUCCESS") {
      saveTxRecord({ ...rec, state: "FAILED", note: "execution error", at: Date.now() });
      throw new TxError(cleanError(leader?.result?.payload?.readable || leader?.genvm_result?.stderr), hash);
    }
    if (s === "FINALIZED") break;
  }
  if (status !== "FINALIZED") {
    saveTxRecord({ ...rec, state: "UNCERTAIN", note: `still ${status} after ${FINALIZE_WAIT_MS / 60000} min`, at: Date.now() });
    throw new TxError(
      `Not finalized yet (${status.toLowerCase()}). The transaction may still complete: its hash is saved on this device, check the explorer or reopen this page later. Do not resubmit.`,
      hash,
    );
  }
  const receipts = tx?.consensus_data?.leader_receipt;
  const leader = Array.isArray(receipts) ? receipts[0] : receipts;
  const result: TxResult = { hash, statusName: status, values: parseReadable(leader?.result?.payload?.readable) };
  if (verify) {
    let problem: string | null;
    try {
      problem = await verify(result);
    } catch (e: any) {
      problem = `could not read the contract to confirm (${String(e?.message ?? e).slice(0, 80)})`;
    }
    if (problem) {
      saveTxRecord({ ...rec, state: "UNVERIFIED", note: problem, at: Date.now() });
      throw new TxError(`The transaction finalized but the expected result is not on-chain: ${problem}`, hash);
    }
  }
  saveTxRecord({ ...rec, state: "CONFIRMED", at: Date.now() });
  return result;
}

/**
 * Sends a write through the wallet and reports success only when it is FINALIZED and the contract state
 * verifies. Guards: wallet account + chain are re-checked right before signing; one in-flight transaction per
 * key (a repeat call resumes watching the saved hash instead of signing again); the hash is persisted at once.
 */
export async function sendTx(
  author: `0x${string}`,
  provider: EthereumProvider,
  functionName: string,
  args: unknown[],
  cb: TxCallbacks = {},
  opts: TxOptions = {},
): Promise<TxResult> {
  const address = requireAddress();
  const key = opts.key ?? functionName;
  const existing = pendingRecord(key, author);
  if (existing) {
    cb.onHash?.(existing.hash);
    cb.onStatus?.(existing.state === "ACCEPTED" ? "ACCEPTED" : "PENDING");
    return watchTx(existing.hash, existing, cb, opts.verify);
  }
  await revalidateWallet(author, provider);
  const writeClient = createClient({ chain: studionet, endpoint: RPC_URL, account: author, provider: provider as any });
  const hash: string = await writeClient.writeContract({ address, functionName, args: args as any, value: BigInt(0) });
  const rec: TxRecord = { hash, key, method: functionName, author, state: "SUBMITTED", at: Date.now() };
  saveTxRecord(rec); // preserved immediately: a reload mid-flight can resume instead of re-signing
  cb.onHash?.(hash);
  cb.onStatus?.("PENDING");
  return watchTx(hash, rec, cb, opts.verify);
}

// ---- state verifiers (what must be true on-chain once each write finalized) -----------------

export const verifiers = {
  /** file_case: the id comes from the transaction's own return value and is checked against contract state. */
  async filed(me: string, title: string, r: TxResult): Promise<string | null> {
    const id = Number(r.values.id);
    if (!Number.isInteger(id)) return "the receipt carries no case id";
    const c = await getCase(id);
    if (c.claimant.toLowerCase() !== me.toLowerCase() || c.title !== title) return `case ${id} is not this filing`;
    return null;
  },
  async status(id: number, ok: CaseStatus[]): Promise<string | null> {
    const c = await getCase(id);
    return ok.includes(c.status) ? null : `case ${id} is ${c.status}, expected ${ok.join(" or ")}`;
  },
};
