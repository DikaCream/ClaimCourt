"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ClerkLog, SectionTitle, Stamp, VOID_TEXT, caseNo } from "@/components/ui";
import { APPEAL_BOND, addressExplorerUrl } from "@/lib/config";
import { pts, sameAddress, shortAddress } from "@/lib/format";
import { countdown, host, utc } from "@/lib/format";
import { useCase, useEvidence, useNow, useTx } from "@/lib/hooks";
import { useWallet } from "@/lib/WalletProvider";
import { getCase, verifiers, type CaseStatus, type CourtCase, type Round } from "@/lib/claimcourt";

function Party({ role, addr, statement, urls, tone, hashes }: { role: string; addr: string; statement: string; urls: string[]; tone: string; hashes: Record<string, string> }) {
  return (
    <div className="pleading p-4">
      <p className={`label ${tone}`}>{role}</p>
      <a href={addressExplorerUrl(addr)} target="_blank" rel="noreferrer" className="typed text-[13px] ink-link">{shortAddress(addr)}</a>
      {statement ? (
        <>
          <p className="mt-3 italic">&ldquo;{statement}&rdquo;</p>
          <p className="label mt-4">Exhibits</p>
          <ul className="mt-1 space-y-1">
            {urls.map((u, i) => (
              <li key={u} className="typed text-[13px]">
                <span className="font-bold">{role[0]}-{i + 1}</span>{" "}
                <a className="ink-link break-all" href={u} target="_blank" rel="noreferrer">{host(u)}{new URL(u).pathname.slice(0, 40)}</a>
                {hashes[u] && <span className="block text-[11px] text-ink-2" title={hashes[u]}>snapshot sha256 {hashes[u].slice(0, 12)}…</span>}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-3 italic text-ink-2">No statement filed yet.</p>
      )}
    </div>
  );
}

function Deadline({ label, ts, now }: { label: string; ts: number; now: number }) {
  const left = ts - now;
  return (
    <p className="typed text-[13px]">
      <span className="label mr-2">{label}</span>
      {utc(ts)} <b className={left <= 0 ? "text-stamp" : ""}>{left <= 0 ? "(passed)" : `(${countdown(left)} left)`}</b>
    </p>
  );
}

function Findings({ rounds }: { rounds: Round[] }) {
  return (
    <div className="space-y-5">
      {rounds.map((r, i) => (
        <article key={i} className="pleading p-4">
          <p className="label">
            Entry {i + 1} · {r.kind === "INITIAL" ? "First ruling" : r.kind === "APPEAL" ? "Appeal ruling (stricter standard)" : r.kind === "APPEAL_UNDETERMINED" ? "Appeal round recorded as UNDETERMINED" : "Clerk's order"} · {utc(r.timestamp)}
          </p>
          <p className="mt-1 font-display text-2xl font-semibold">{r.ruling === "UNDETERMINED" ? "No determinable ruling" : r.ruling === "VOID" ? "Case voided" : r.ruling === "INCONCLUSIVE" ? "Inconclusive" : `${r.ruling[0]}${r.ruling.slice(1).toLowerCase()} prevails`}</p>
          <p className="mt-2">{r.reasoning}</p>
          {r.evidence_quote && (
            <blockquote className="mt-3 border-l-4 border-stamp bg-paper-2/70 px-4 py-2 font-serif italic">
              &ldquo;{r.evidence_quote}&rdquo;
              <footer className="typed mt-1 text-[12px] not-italic text-ink-2">
                quoted from <a className="ink-link" href={r.source_url} target="_blank" rel="noreferrer">{r.source_url}</a>
              </footer>
            </blockquote>
          )}
          {r.findings && r.findings.length > 0 && (
            <div className="mt-3" data-testid="findings">
              <p className="label">Evidence findings ({r.findings.length}) · each quote checked verbatim by every validator</p>
              <ul className="mt-1 space-y-1">
                {r.findings.map((f, k) => (
                  <li key={k} className="typed text-[12px]">
                    <span className={`stamp stamp-sm mr-1 ${f.supports === "CLAIMANT" ? "text-navy" : f.supports === "RESPONDENT" ? "text-ochre" : "text-ink-2"}`}>{f.supports}</span>
                    {k === r.decisive && <b className="mr-1 text-stamp">decisive</b>}
                    exhibit {f.exhibit}: &ldquo;{f.quote}&rdquo; <span className="text-ink-2">— {f.fact}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {r.evidence_incomplete && r.evidence_incomplete.length > 0 && (
            <p className="typed mt-3 border-2 border-stamp p-2 text-[12px] font-bold text-stamp">Historical evidence incomplete for {r.evidence_incomplete.map(host).join(" · ")}: directional rulings are blocked, so this ruling is INCONCLUSIVE.</p>
          )}
          {r.evidence_changed && r.evidence_changed.length > 0 && (
            <p className="typed mt-3 border-2 border-stamp p-2 text-[12px] font-bold text-stamp">
              Evidence changed since the filing snapshot: {r.evidence_changed.map(host).join(" · ")}. Those exhibits were judged from the stored snapshot text (the full fingerprinted window), not the live page.
            </p>
          )}
          {r.sources.length > 0 && <p className="typed mt-3 text-[11px] text-ink-2">Exhibits read: {r.sources.map(host).join(" · ")}</p>}
        </article>
      ))}
    </div>
  );
}

function Motions({ c }: { c: CourtCase }) {
  const w = useWallet();
  const tx = useTx();
  const now = useNow();
  const [stmt, setStmt] = useState("");
  const [urls, setUrls] = useState(["", "", ""]);
  const [reason, setReason] = useState("");
  const [extra, setExtra] = useState("");
  const me = w.address;
  const isC = sameAddress(me, c.claimant);
  const isR = sameAddress(me, c.respondent);
  const canAppeal = (isC || isR) && c.status === "RULED" && c.appeal_open &&
    !((c.ruling === "CLAIMANT" && isC) || (c.ruling === "RESPONDENT" && isR));
  const ok = !!me && w.isCorrectChain;
  const id = c.id;
  const clean = urls.map((u) => u.trim()).filter(Boolean);
  const busyLabel = (t: string) => (tx.busy ? "Waiting for finalization…" : t);
  // Every action is keyed per case+method (no duplicate in-flight submissions) and only reports success once
  // the transaction FINALIZED and the case is really in an expected state.
  const act = (fn: string, args: unknown[], expect: CaseStatus[]) =>
    tx.run(fn, args, {
      key: `${fn}:${id}`,
      verify: async (r) => {
        if (fn === "rule_appeal") {
          const cc = await getCase(id);
          if (cc.status === "APPEALED" && cc.appeal_undetermined > 0) return "the validators could not decide this appeal round; it was recorded as an attempt. You may run it again before the deadline.";
          return cc.status === "FINAL" ? null : `case is ${cc.status}, expected FINAL`;
        }
        return verifiers.status(id, expect);
      },
    });

  const items: React.ReactNode[] = [];
  if (c.status === "AWAITING_RESPONSE") {
    if (isR && now < c.respond_by) {
      items.push(
        <div key="resp" className="pleading p-4">
          <p className="font-display text-xl font-semibold">Answer the complaint</p>
          <p className="text-[15px] italic text-ink-2">You must match the stake of {pts(c.stake)} points. Add your statement and 1–3 exhibits.</p>
          <textarea className="field mt-3" rows={3} maxLength={800} value={stmt} onChange={(e) => setStmt(e.target.value)} placeholder="Your statement (min 20 characters)" />
          {urls.map((u, i) => (
            <input key={i} className="field mt-2" placeholder={`Exhibit R-${i + 1} https://…`} value={u} spellCheck={false}
              onChange={(e) => setUrls(urls.map((x, j) => (j === i ? e.target.value : x)))} />
          ))}
          <button className="btn mt-4" disabled={!ok || tx.busy || stmt.trim().length < 20 || clean.length < 1}
            onClick={() => act("respond", [id, stmt, clean], ["READY", "RULED", "APPEALED", "FINAL"])}>{busyLabel(`Match stake & answer`)}</button>
        </div>,
      );
    }
    if (isC) {
      items.push(
        <button key="wd" className="btn btn-ghost" disabled={!ok || tx.busy} onClick={() => act("withdraw_case", [id], ["VOID"])}>
          Withdraw case (stake returns)
        </button>,
      );
    }
    if (now >= c.respond_by) {
      items.push(
        <button key="ex" className="btn btn-red" disabled={!ok || tx.busy} onClick={() => act("expire", [id], ["VOID", "FINAL"])}>
          {busyLabel("Void: respondent never answered")}
        </button>,
      );
    }
  }
  if (c.status === "READY") {
    if (now < c.ruling_due) {
      items.push(
        <div key="rule">
          <button className="btn btn-red" disabled={!ok || tx.busy} onClick={() => act("rule", [id], ["RULED", "APPEALED", "FINAL"])}>{busyLabel("Call the ruling")}</button>
          <p className="mt-2 text-[14px] italic text-ink-2">Anyone may call it. Validators compare every exhibit with its filing-time snapshot first; this takes about a minute.</p>
        </div>,
      );
    } else {
      items.push(
        <button key="ex" className="btn btn-red" disabled={!ok || tx.busy} onClick={() => act("expire", [id], ["VOID", "FINAL"])}>
          {busyLabel("Void: ruling deadline passed (refund both)")}
        </button>,
      );
    }
  }
  if (c.status === "RULED") {
    if (canAppeal) {
      items.push(
        <div key="app" className="pleading p-4">
          <p className="font-display text-xl font-semibold">Notice of appeal</p>
          <p className="text-[15px] italic text-ink-2">
            Bond: {APPEAL_BOND} points. If the second, stricter round upholds a ruling for the other side you forfeit the bond to them; if it changes the ruling you get it back. If the appeal is never decided, the FIRST ruling stands and is paid out: leaving an appeal unresolved is never an escape, and the bond is forfeited unless validators demonstrably failed (see the appeal-finality table in the Local Rules).
          </p>
          <textarea className="field mt-3" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Grounds of appeal (20–500 characters)" />
          <input className="field mt-2" placeholder="Optional new exhibit https://…" value={extra} onChange={(e) => setExtra(e.target.value)} spellCheck={false} />
          <button className="btn btn-red mt-4" disabled={!ok || tx.busy || reason.trim().length < 20}
            onClick={() => act("appeal", [id, reason, extra.trim()], ["APPEALED", "FINAL"])}>{busyLabel(`File appeal (bond ${APPEAL_BOND})`)}</button>
        </div>,
      );
    }
    if (!c.appeal_open) {
      items.push(
        <button key="fin" className="btn" disabled={!ok || tx.busy} onClick={() => act("finalize", [id], ["FINAL"])}>{busyLabel("Finalize and pay out")}</button>,
      );
    }
  }
  if (c.status === "APPEALED") {
    items.push(
      now < c.appeal_due ? (
        <div key="ra">
          <button className="btn btn-red" disabled={!ok || tx.busy} onClick={() => act("rule_appeal", [id], ["FINAL"])}>{busyLabel("Hear the appeal")}</button>
          <p className="mt-2 text-[14px] italic text-ink-2">Anyone may call it. A stricter standard applies. If validators fail to reach consensus, the appellant can record an attempt below (max {3}; each adds {c.appeal_grace_s / 60} min).</p>
          {sameAddress(me, c.appellant) && c.appeal_attempts < 3 && (
            <button className="btn btn-ghost mt-2" disabled={!ok || tx.busy} onClick={() => tx.run("register_appeal_attempt", [id], { key: `register_appeal_attempt:${id}:${c.appeal_attempts}`, verify: async () => ((await getCase(id)).appeal_attempts > c.appeal_attempts ? null : "attempt not recorded") })}>
              Record an appeal attempt ({c.appeal_attempts}/3)
            </button>
          )}
        </div>
      ) : (
        <button key="ex" className="btn btn-red" disabled={!ok || tx.busy} onClick={() => act("expire", [id], ["VOID", "FINAL"])}>
          {busyLabel("Settle: appeal deadline passed (first ruling stands)")}
        </button>
      ),
    );
  }
  if (items.length === 0 && !tx.status) return null;
  return (
    <>
      <SectionTitle n="V.">Motions available to you</SectionTitle>
      {!me && <p className="typed text-[13px]">Sign in with MetaMask to act on this case.</p>}
      {me && !w.isCorrectChain && (
        <p className="typed text-[13px] text-stamp">
          Your wallet is on the wrong network.{" "}
          <button className="ink-link underline" onClick={w.switchChain}>Switch to GenLayer Studionet</button> to act on this case.
        </p>
      )}
      <div className="space-y-4">{items}</div>
      <ClerkLog status={tx.status} hash={tx.hash} error={tx.error} />
    </>
  );
}

export default function CasePage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const q = useCase(Number.isInteger(id) ? id : null);
  const c = q.data;
  const ev = useEvidence(Number.isInteger(id) ? id : null, c?.rounds ?? 0);
  const now = useNow();
  const hashes: Record<string, string> = Object.fromEntries((c?.snapshots ?? []).map((s) => [s.url, s.sha256]));
  if (q.isLoading) return <p className="py-10 typed animate-pulse">The clerk is pulling the file…</p>;
  if (!Number.isInteger(id) || id < 0) return <p className="py-10 typed text-stamp">That is not a case number. <Link href="/" className="ink-link">Back to the docket</Link></p>;
  if (q.error || !c) return <p className="py-10 typed text-stamp">Could not load case {id}: {q.error ? String((q.error as Error).message).slice(0, 160) : "no such case"}. <Link href="/" className="ink-link">Back to the docket</Link></p>;

  return (
    <div className="pt-8">
      <Link href="/" className="typed text-[12px] ink-link">← The docket</Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="typed text-sm font-bold text-stamp">{caseNo(c.id)} · {c.category}</p>
          <p className="label mt-2">In the matter of</p>
          <h1 className="font-display text-4xl font-semibold leading-tight sm:text-5xl">{c.title}</h1>
          <p className="mt-2 text-lg"><span className="typed text-sm">{shortAddress(c.claimant)}</span> <i>v.</i> <span className="typed text-sm">{shortAddress(c.respondent)}</span></p>
        </div>
        <div className="pt-4 pr-2"><Stamp c={c} size="lg" /></div>
      </div>

      <div className="rule-thin mt-5 grid gap-x-8 gap-y-1 pt-3 sm:grid-cols-2">
        <p className="typed text-[13px]"><span className="label mr-2">Filed</span>{utc(c.filed_at)}</p>
        <p className="typed text-[13px]"><span className="label mr-2">Pot</span><b>{pts(c.pot)} pts</b> ({pts(c.stake)} each)</p>
        {c.status === "AWAITING_RESPONSE" && <Deadline label="Answer due" ts={c.respond_by} now={now} />}
        {c.status === "READY" && <Deadline label="Ruling due" ts={c.ruling_due} now={now} />}
        {c.status === "RULED" && <Deadline label="Appeal window ends" ts={c.appeal_ends} now={now} />}
        {c.status === "APPEALED" && <Deadline label={`Appeal due (${c.appeal_attempts} attempt${c.appeal_attempts === 1 ? "" : "s"} recorded)`} ts={c.appeal_due} now={now} />}
        {c.final_at > 0 && <p className="typed text-[13px]"><span className="label mr-2">Closed</span>{utc(c.final_at)}</p>}
      </div>

      <SectionTitle n="I.">The claim</SectionTitle>
      {c.status === "REJECTED" ? (
        <div className="mb-4 border-2 border-ink-2 p-3 typed text-[13px]">
          <b>Dismissed at filing.</b> {c.reject_reason} No stake was taken.
        </div>
      ) : null}
      <p className="text-[19px]">{c.claim}</p>
      <p className="mt-2"><span className="label mr-2">Relief sought</span><i>{c.relief}</i></p>

      <SectionTitle n="II.">Pleadings &amp; exhibits</SectionTitle>
      <div className="grid gap-6 md:grid-cols-2">
        <Party role="Claimant" addr={c.claimant} statement={c.claimant_statement} urls={c.claimant_evidence} tone="text-navy" hashes={hashes} />
        <Party role="Respondent" addr={c.respondent} statement={c.respondent_statement} urls={c.respondent_evidence} tone="text-ochre" hashes={hashes} />
      </div>

      {(c.status === "VOID" || c.appellant) && (
        <>
          <SectionTitle n="III.">Orders</SectionTitle>
          {c.status === "VOID" && <p className="typed text-[14px]">{VOID_TEXT[c.void_reason] ?? "Case voided; stakes returned."}</p>}
          {c.appellant && (
            <div className="pleading mt-3 p-4">
              <p className="label text-plum">Appeal · by {sameAddress(c.appellant, c.claimant) ? "claimant" : "respondent"} · bond {APPEAL_BOND} pts</p>
              <p className="mt-1 italic">&ldquo;{c.appeal_reason}&rdquo;</p>
              {c.appeal_evidence.map((u) => <p key={u} className="typed mt-1 text-[12px]">New exhibit: <a className="ink-link" href={u} target="_blank" rel="noreferrer">{u}</a></p>)}
              {c.appeal_result && (
                <p className="typed mt-2 text-[13px] font-bold">
                  {c.appeal_result === "OVERTURNED" ? "Ruling changed on appeal. Bond returned."
                    : c.appeal_result === "UNRESOLVED"
                      ? `Appeal never decided by its deadline: the first ruling (${c.first_ruling}) stands and was paid out. Bond ${c.appeal_bond_outcome === "RETURNED" ? "returned (validators recorded a failed round)" : c.appeal_bond_outcome === "SPLIT" ? "split 50/50 (attempt registered, no failure recorded)" : "forfeited to the other party (appeal not pursued)"}.`
                      : c.appeal_bond_outcome === "RETURNED" ? "Ruling upheld (still inconclusive). Bond returned to the appellant." : "Ruling upheld. Bond forfeited to the other party."}
                </p>
              )}
            </div>
          )}
        </>
      )}

      {(c.rounds > 0) && (
        <>
          <SectionTitle n="IV." aside="written on-chain">Findings of the validators</SectionTitle>
          {ev.data ? <Findings rounds={ev.data} /> : <p className="typed animate-pulse">Reading the record…</p>}
        </>
      )}

      <Motions c={c} />
    </div>
  );
}
