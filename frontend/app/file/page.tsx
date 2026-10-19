"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ClerkLog, SectionTitle } from "@/components/ui";
import { APPEAL_BOND } from "@/lib/config";
import { pts } from "@/lib/format";
import { useTx, useUser } from "@/lib/hooks";
import { useWallet } from "@/lib/WalletProvider";
import { getCasesByFiler, verifiers } from "@/lib/claimcourt";

const CATEGORIES = ["CONTRACT", "SERVICE", "COMMUNITY", "CREATOR", "TECH", "OTHER"];
const DURATIONS = [
  { s: 60, label: "1 minute (demo)" },
  { s: 600, label: "10 minutes" },
  { s: 3600, label: "1 hour" },
  { s: 86400, label: "1 day" },
  { s: 259200, label: "3 days" },
  { s: 604800, label: "7 days" },
];

function Duration({ label, hint, value, onChange }: { label: string; hint: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <select className="field" value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {DURATIONS.map((d) => <option key={d.s} value={d.s}>{d.label}</option>)}
      </select>
      <span className="text-[13px] italic text-ink-2">{hint}</span>
    </label>
  );
}

export default function FileCase() {
  const w = useWallet();
  const user = useUser(w.address);
  const tx = useTx();
  const router = useRouter();
  const [f, setF] = useState({
    title: "", claim: "", relief: "", category: "OTHER", respondent: "", statement: "", stake: 100,
    urls: ["", "", ""], respondWindow: 86400, rulingTimeout: 86400, appealWindow: 3600, appealTimeout: 86400,
  });
  const set = (p: Partial<typeof f>) => setF((s) => ({ ...s, ...p }));
  const urls = f.urls.map((u) => u.trim()).filter(Boolean);
  const valid =
    f.title.trim().length >= 8 && f.claim.trim().length >= 40 && f.relief.trim().length >= 10 && f.statement.trim().length >= 20 &&
    /^0x[0-9a-fA-F]{40}$/.test(f.respondent.trim()) && urls.length >= 1 && f.stake >= 10;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (tx.busy || !w.address) return;
    const me = w.address;
    const title = f.title.trim().replace(/\s+/g, " ");
    // The new case id is NOT guessed from the case count: it is the id in this transaction's own return value,
    // checked against contract state once the transaction is FINALIZED (claimant + title must match).
    const r = await tx.run(
      "file_case",
      [f.title, f.claim, f.relief, f.category, f.respondent.trim(), f.statement, urls, f.stake,
        f.respondWindow, f.rulingTimeout, f.appealWindow, f.appealTimeout],
      { key: `file_case:${title.toLowerCase()}`, verify: (res) => verifiers.filed(me, title, res) },
    );
    if (!r) return;
    let id = Number(r.values.id);
    if (!Number.isInteger(id)) id = (await getCasesByFiler(me, 0, 1)).items[0]?.id ?? -1; // fallback: newest case this wallet filed
    if (id >= 0) router.push(`/case/${id}`);
  }

  return (
    <form onSubmit={submit} className="pt-8">
      <p className="label">Form CC-1</p>
      <h1 className="font-display text-4xl font-semibold">Complaint &amp; statement of the claimant</h1>
      <p className="mt-2 max-w-2xl italic text-ink-2">
        Be concrete. The court&apos;s screening validators dismiss vague, frivolous or unprovable complaints before any stake is taken.
        Evidence must be public https pages (no shorteners, no IP addresses).
      </p>

      <SectionTitle n="I.">The matter</SectionTitle>
      <div className="grid gap-5 md:grid-cols-[2fr_1fr]">
        <label className="block"><span className="label">Title of the case (8–100)</span>
          <input className="field" maxLength={100} value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="Late delivery of a website" />
        </label>
        <label className="block"><span className="label">Category</span>
          <select className="field" value={f.category} onChange={(e) => set({ category: e.target.value })}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
      </div>
      <label className="mt-5 block"><span className="label">The claim: what happened, with checkable facts ({f.claim.trim().length}/800, min 40)</span>
        <textarea className="field mt-1" rows={4} maxLength={800} value={f.claim} onChange={(e) => set({ claim: e.target.value })}
          placeholder="The freelancer agreed in writing to deliver by 1 September and delivered on 15 September…" />
      </label>
      <label className="mt-5 block"><span className="label">Relief requested (10–300)</span>
        <input className="field" maxLength={300} value={f.relief} onChange={(e) => set({ relief: e.target.value })} placeholder="A 50 percent refund of the fee" />
      </label>

      <SectionTitle n="II.">The respondent &amp; the stake</SectionTitle>
      <div className="grid gap-5 md:grid-cols-[2fr_1fr]">
        <label className="block"><span className="label">Respondent wallet address</span>
          <input className="field" value={f.respondent} onChange={(e) => set({ respondent: e.target.value })} placeholder="0x…" spellCheck={false} />
        </label>
        <label className="block"><span className="label">Stake (points, min 10)</span>
          <input className="field" type="number" min={10} value={f.stake} onChange={(e) => set({ stake: Math.max(0, Math.floor(Number(e.target.value))) })} />
          <span className="text-[13px] italic text-ink-2">The respondent must match it. Balance: {user.data ? pts(user.data.balance) : "–"}.</span>
        </label>
      </div>

      <SectionTitle n="III.">Your statement &amp; exhibits</SectionTitle>
      <label className="block"><span className="label">Statement ({f.statement.trim().length}/800, min 20). An allegation, not proof.</span>
        <textarea className="field mt-1" rows={3} maxLength={800} value={f.statement} onChange={(e) => set({ statement: e.target.value })} />
      </label>
      <div className="mt-5 space-y-3">
        {f.urls.map((u, i) => (
          <label key={i} className="block"><span className="label">Exhibit A-{i + 1} {i === 0 ? "(required)" : "(optional)"}</span>
            <input className="field" value={u} placeholder="https://…" spellCheck={false}
              onChange={(e) => set({ urls: f.urls.map((x, j) => (j === i ? e.target.value : x)) })} />
          </label>
        ))}
      </div>

      <SectionTitle n="IV.">Time limits (so nothing hangs)</SectionTitle>
      <div className="grid gap-5 sm:grid-cols-2">
        <Duration label="Respondent must answer within" hint="Otherwise the case is void and your stake returns." value={f.respondWindow} onChange={(n) => set({ respondWindow: n })} />
        <Duration label="Ruling must be reached within" hint="Counted from the answer. Otherwise both stakes return." value={f.rulingTimeout} onChange={(n) => set({ rulingTimeout: n })} />
        <Duration label="Appeal window after a ruling" hint={`A party who did not prevail may appeal for a ${APPEAL_BOND}-point bond.`} value={f.appealWindow} onChange={(n) => set({ appealWindow: n })} />
        <Duration label="Appeal must be decided within" hint="If nobody completes it, the FIRST ruling stands and is paid out; see the appeal-finality rules." value={f.appealTimeout} onChange={(n) => set({ appealTimeout: n })} />
      </div>

      <div className="rule-double mt-10 pt-5">
        <button className="btn btn-red" disabled={!valid || tx.busy || !w.address || !w.isCorrectChain}>
          {tx.busy ? "Waiting for finalization…" : `Stamp & file (stake ${f.stake} pts)`}
        </button>
        {!w.address && <span className="ml-3 typed text-[12px]">Sign in with MetaMask first.</span>}
        {w.address && !w.isCorrectChain && (
          <span className="ml-3 typed text-[12px] text-stamp">
            Wrong network. <button type="button" className="ink-link underline" onClick={w.switchChain}>Switch to GenLayer Studionet</button>
          </span>
        )}
        <ClerkLog status={tx.status} hash={tx.hash} error={tx.error} />
      </div>
    </form>
  );
}
