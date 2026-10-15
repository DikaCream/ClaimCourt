"use client";

import type { CourtCase } from "@/lib/claimcourt";
import { FAILED_STATUSES, TX_STEPS } from "@/lib/claimcourt";
import { txExplorerUrl } from "@/lib/config";

export const caseNo = (id: number) => `CC-${String(id + 1).padStart(4, "0")}`;

interface StampMeta { label: string; color: string }

/** Status of a case as it would be stamped on the docket. */
export function statusStamp(c: Pick<CourtCase, "status" | "ruling" | "void_reason" | "appeal_result">): StampMeta {
  switch (c.status) {
    case "REJECTED": return { label: "Dismissed", color: "text-ink-2" };
    case "AWAITING_RESPONSE": return { label: "Summoned", color: "text-ochre" };
    case "READY": return { label: "Ready for ruling", color: "text-navy" };
    case "RULED": return { label: "Ruled · appealable", color: "text-navy" };
    case "APPEALED": return { label: "On appeal", color: "text-plum" };
    case "VOID": return { label: "Void · refunded", color: "text-ink-2" };
    case "FINAL":
      if (c.ruling === "CLAIMANT") return { label: "Claimant prevails", color: "text-stamp" };
      if (c.ruling === "RESPONDENT") return { label: "Respondent prevails", color: "text-stamp" };
      return { label: "Inconclusive", color: "text-plum" };
  }
}

export function Stamp({ c, size = "sm" }: { c: Parameters<typeof statusStamp>[0]; size?: "sm" | "lg" }) {
  const s = statusStamp(c);
  return <span className={`stamp ${size === "lg" ? "stamp-lg stamp-anim" : "stamp-sm"} ${s.color}`}>{s.label}</span>;
}

export const VOID_TEXT: Record<string, string> = {
  NO_RESPONSE: "The respondent did not answer before the deadline. The claimant's stake was returned.",
  WITHDRAWN: "The claimant withdrew the case before an answer. The stake was returned.",
  RULING_TIMEOUT: "No ruling reached consensus before the ruling deadline. Both stakes were returned.",
  APPEAL_TIMEOUT: "The appeal was not decided before its deadline. Both stakes and the appeal bond were returned.",
};

export function SectionTitle({ n, children, aside }: { n?: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-3 mt-10 flex items-end justify-between gap-4 border-b-[3px] border-double border-ink pb-1">
      <h2 className="font-display text-2xl font-semibold tracking-tight">
        {n && <span className="typed mr-2 text-base text-stamp">{n}</span>}
        {children}
      </h2>
      {aside && <div className="label pb-1">{aside}</div>}
    </div>
  );
}

/** The clerk's log: live consensus progress, typed line by line. */
export function ClerkLog({ status, hash, error }: { status: string | null; hash?: string | null; error?: string | null }) {
  if (!status && !error) return null;
  const failed = !!status && FAILED_STATUSES.has(status);
  const idx = status ? TX_STEPS.indexOf(status as (typeof TX_STEPS)[number]) : -1;
  const lines = status === "SIGNING" ? ["Awaiting your signature in MetaMask…"] : idx >= 0 ? TX_STEPS.slice(0, idx + 1).map((s) => s.charAt(0) + s.slice(1).toLowerCase()) : status ? [status] : [];
  return (
    <div className="mt-4 border border-dashed border-ink bg-paper-2/60 p-3 typed text-[13px]" data-testid="clerk-log">
      <div className="label mb-1">Clerk&apos;s log</div>
      {lines.map((l, i) => (
        <div key={l + i} className="log-line">
          <span className="text-ink-2">{String(i + 1).padStart(2, "0")}.</span> {l}
          {i === lines.length - 1 && !failed && status !== "ACCEPTED" && status !== "FINALIZED" && <span className="animate-pulse">…</span>}
        </div>
      ))}
      {failed && <div className="text-stamp">Validators could not agree ({status}).</div>}
      {error && <div className="mt-1 text-stamp">Rejected: {error}</div>}
      {hash && (
        <a href={txExplorerUrl(hash)} target="_blank" rel="noreferrer" className="ink-link mt-1 inline-block text-ink-2">
          transaction {hash.slice(0, 10)}…
        </a>
      )}
    </div>
  );
}
