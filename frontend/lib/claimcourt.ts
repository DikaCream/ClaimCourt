// Typed wrapper around the ClaimCourt intelligent contract using genlayer-js.
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import type { TransactionHash } from "genlayer-js/types";
import { CONTRACT_ADDRESS, RPC_URL } from "./config";
import type { EthereumProvider } from "./wallet";

export type CaseStatus = "REJECTED" | "AWAITING_RESPONSE" | "READY" | "RULED" | "APPEALED" | "FINAL" | "VOID";
export type Ruling = "" | "CLAIMANT" | "RESPONDENT" | "INCONCLUSIVE";

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
  void_reason: "" | "NO_RESPONSE" | "WITHDRAWN" | "RULING_TIMEOUT" | "APPEAL_TIMEOUT";
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
  appeal_result: "" | "OVERTURNED" | "UPHELD";
  final_at: number;
  rounds: number;
}

export interface Round {
  kind: "INITIAL" | "APPEAL" | "TIMEOUT";
  ruling: string;
  evidence_quote: string;
  source_url: string;
  reasoning: string;
  sources: string[];
  caller: string;
  timestamp: number;
}

export interface UserInfo {
  address: string;
  balance: number;
  claimed_start: boolean;
  cases: { id: number; title: string; status: CaseStatus; ruling: Ruling; role: "CLAIMANT" | "RESPONDENT" }[];
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
  read<{ total: number; items: CourtCase[] }>("get_cases", [status, offset, limit]);
export const getCase = (id: number) => read<CourtCase>("get_case", [id]);
export const getEvidence = (id: number) => read<Round[]>("get_evidence", [id]);
export const getUser = (user: string) => read<UserInfo>("get_user", [user]);
export const getStats = () => read<Stats>("get_stats");

// ------------------------------------------------------------------ transactions

/** Consensus steps shown in the UI, in order (from the transaction's statusName). */
export const TX_STEPS = ["PENDING", "PROPOSING", "COMMITTING", "REVEALING", "ACCEPTED", "FINALIZED"] as const;
const DONE = new Set(["ACCEPTED", "FINALIZED"]);
export const FAILED_STATUSES = new Set(["UNDETERMINED", "CANCELED", "LEADER_TIMEOUT", "VALIDATORS_TIMEOUT"]);

export interface TxCallbacks {
  onHash?: (hash: string) => void;
  onStatus?: (status: string) => void;
}

export interface TxResult {
  hash: string;
  statusName: string;
  values: Record<string, unknown>;
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

async function watchFinalized(hash: string, onStatus: (s: string) => void) {
  const deadline = Date.now() + 3 * 60_000;
  while (Date.now() < deadline) {
    await sleep(5000);
    const tx = await fetchTx(hash);
    if (tx?.statusName === "FINALIZED") return onStatus("FINALIZED");
  }
}

/**
 * Sends a write through MetaMask, then polls the transaction and reports every consensus
 * status change (PENDING → PROPOSING → COMMITTING → REVEALING → ACCEPTED → FINALIZED).
 */
export async function sendTx(
  author: `0x${string}`,
  provider: EthereumProvider,
  functionName: string,
  args: unknown[],
  cb: TxCallbacks = {},
): Promise<TxResult> {
  const address = requireAddress();
  const writeClient = createClient({ chain: studionet, endpoint: RPC_URL, account: author, provider: provider as any });
  const hash: string = await writeClient.writeContract({ address, functionName, args: args as any, value: BigInt(0) });
  cb.onHash?.(hash);
  cb.onStatus?.("PENDING");

  let status = "PENDING";
  let tx: any = null;
  const deadline = Date.now() + 6 * 60_000;
  while (Date.now() < deadline) {
    await sleep(2000);
    const next = await fetchTx(hash);
    if (!next) continue;
    tx = next;
    const s = String(tx.statusName ?? status);
    if (s !== status) {
      status = s;
      cb.onStatus?.(s);
    }
    if (DONE.has(s) || FAILED_STATUSES.has(s)) break;
  }
  if (!DONE.has(status)) {
    throw new TxError(
      FAILED_STATUSES.has(status)
        ? `Validators could not agree (status: ${status})`
        : `Still ${status.toLowerCase()} after 6 minutes. Studionet may be busy; the transaction can still complete, check the explorer.`,
      hash,
    );
  }

  const receipts = tx?.consensus_data?.leader_receipt;
  const leader = Array.isArray(receipts) ? receipts[0] : receipts;
  const readable = leader?.result?.payload?.readable;
  if (leader?.execution_result && leader.execution_result !== "SUCCESS") {
    throw new TxError(cleanError(readable || leader?.genvm_result?.stderr), hash);
  }
  if (status === "ACCEPTED" && cb.onStatus) void watchFinalized(hash, cb.onStatus);
  return { hash, statusName: status, values: parseReadable(readable) };
}
