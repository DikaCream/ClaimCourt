"use client";

import Link from "next/link";
import { useState } from "react";
import { Stamp, caseNo } from "@/components/ui";
import { host, pts, shortAddress, timeAgo } from "@/lib/format";
import { CONTRACT_ADDRESS } from "@/lib/config";
import { useCases, useStats } from "@/lib/hooks";

const TABS: { key: string; label: string }[] = [
  { key: "", label: "All matters" },
  { key: "AWAITING_RESPONSE", label: "Summoned" },
  { key: "READY", label: "Ready" },
  { key: "RULED", label: "Ruled" },
  { key: "APPEALED", label: "On appeal" },
  { key: "FINAL", label: "Final" },
  { key: "VOID", label: "Void" },
  { key: "REJECTED", label: "Dismissed" },
];

export default function Docket() {
  const [tab, setTab] = useState("");
  const cases = useCases(tab);
  const stats = useStats();
  const s = stats.data;
  return (
    <div className="pt-8">
      <section className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
        <div>
          <p className="label">Notice to the public</p>
          <p className="dropcap mt-2 text-[19px] leading-relaxed">
            ClaimCourt settles small disputes between two wallets without a human judge. Each side escrows the same stake of
            points, files a statement and up to three public exhibits, and a panel of AI validators fetches the pages, agrees on a
            ruling, and writes its reasons on-chain with a verbatim quote. A losing party may appeal once, under a stricter
            standard, for a bond. Nothing can hang: every stage has a deadline, and a missed one returns the stakes.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/file" className="btn">File a case</Link>
            <Link href="/rules" className="btn btn-ghost">Read the local rules</Link>
          </div>
        </div>
        <aside className="pleading p-4">
          <p className="label mb-2">Calendar of the court</p>
          <dl className="grid grid-cols-2 gap-y-2 typed text-[14px]">
            <dt>Cases filed</dt><dd className="text-right font-bold">{s ? s.cases : "–"}</dd>
            <dt>Decided (final)</dt><dd className="text-right font-bold">{s ? s.by_status.FINAL : "–"}</dd>
            <dt>Appeals heard</dt><dd className="text-right font-bold">{s ? s.appeals : "–"}</dd>
            <dt>Overturned</dt><dd className="text-right font-bold">{s ? s.overturned : "–"}</dd>
            <dt>Dismissed at filing</dt><dd className="text-right font-bold">{s ? s.by_status.REJECTED : "–"}</dd>
            <dt>Points ever staked</dt><dd className="text-right font-bold">{s ? pts(s.total_staked) : "–"}</dd>
          </dl>
        </aside>
      </section>

      <div className="mt-10 flex flex-wrap items-end border-b-[1.5px] border-ink" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className="tab" onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-1">
        <div className="label hidden grid-cols-[88px_1fr_90px_190px_80px] gap-3 border-b border-ink py-2 md:grid">
          <span>Case No.</span><span>Matter</span><span className="text-right">At stake</span><span>Status</span><span className="text-right">Filed</span>
        </div>
        {!CONTRACT_ADDRESS && <p className="py-8 typed">The court contract address is not configured.</p>}
        {cases.isLoading && <p className="py-8 typed animate-pulse">The clerk is fetching the docket…</p>}
        {cases.error && <p className="py-8 typed text-stamp">Could not reach the court: {(cases.error as Error).message}</p>}
        {cases.data && cases.data.items.length === 0 && (
          <p className="py-10 text-center font-display text-xl italic text-ink-2">
            No matters on this docket. <Link href="/file" className="ink-link text-stamp">File the first.</Link>
          </p>
        )}
        {cases.data?.items.map((c) => (
          <Link
            key={c.id}
            href={`/case/${c.id}`}
            className="docket-row grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 py-3 md:grid-cols-[88px_1fr_90px_190px_80px]"
          >
            <span className="typed text-[14px] font-bold text-stamp">{caseNo(c.id)}</span>
            <span className="order-last col-span-2 md:order-none md:col-span-1">
              <span className="font-display text-xl font-semibold leading-tight">{c.title}</span>
              <span className="mt-0.5 block text-[15px] text-ink-2">
                <span className="typed text-[12px]">{shortAddress(c.claimant)}</span> <i>v.</i>{" "}
                <span className="typed text-[12px]">{shortAddress(c.respondent)}</span>
                <span className="typed text-[11px]"> · {c.category} · {c.claimant_evidence.map(host).join(", ")}</span>
              </span>
            </span>
            <span className="typed text-right text-[14px] font-bold">{pts(c.pot)} pts</span>
            <span className="justify-self-end md:justify-self-start"><Stamp c={c} /></span>
            <span className="typed hidden text-right text-[12px] text-ink-2 md:block">{timeAgo(c.filed_at)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
