"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CONTRACT_ADDRESS, addressExplorerUrl, START_POINTS } from "@/lib/config";
import { pts, shortAddress } from "@/lib/format";
import { useTx, useUser } from "@/lib/hooks";
import { useWallet } from "@/lib/WalletProvider";

const NAV = [
  { href: "/", label: "The Docket" },
  { href: "/file", label: "File a Case" },
  { href: "/rules", label: "Local Rules" },
];

export function Masthead() {
  const path = usePathname();
  const w = useWallet();
  const user = useUser(w.address);
  const tx = useTx();
  const needsPoints = !!w.address && user.data && !user.data.claimed_start;
  return (
    <header>
      <div className="flex items-start justify-between gap-4">
        <div className="label hidden sm:block">Studionet Small Claims Division · Chain 61999</div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-3 typed text-[12px]">
          {w.address && user.data && (
            <span className="border border-ink px-2 py-1" title="Court points">
              {pts(user.data.balance)} pts
            </span>
          )}
          {needsPoints && (
            <button className="btn btn-red !px-3 !py-1.5" disabled={tx.busy} onClick={() => tx.run("claim_points", [])}>
              Claim {pts(START_POINTS)} pts
            </button>
          )}
          {w.address && !w.isCorrectChain && (
            <button className="btn btn-red !px-3 !py-1.5" onClick={w.switchChain}>Switch to Studionet</button>
          )}
          {w.address ? (
            <button className="btn btn-ghost !px-3 !py-1.5" onClick={w.disconnect} title="Disconnect">
              {shortAddress(w.address)} ✕
            </button>
          ) : (
            <button className="btn !px-3 !py-1.5" onClick={w.connect} disabled={w.isConnecting}>
              {w.isConnecting ? "Connecting…" : w.isMetaMaskAvailable ? "Sign in with MetaMask" : "Install MetaMask"}
            </button>
          )}
        </div>
      </div>
      {(w.error || tx.error) && <p className="mt-2 text-right typed text-[12px] text-stamp">{w.error || tx.error}</p>}

      <div className="mt-4 text-center">
        <div className="mx-auto mb-2 flex max-w-md items-center gap-3 text-ink-2">
          <span className="h-px flex-1 bg-ink" /><span className="font-display text-2xl text-stamp">§</span><span className="h-px flex-1 bg-ink" />
        </div>
        <Link href="/" className="font-display text-5xl font-semibold tracking-tight sm:text-7xl" style={{ fontVariationSettings: '"opsz" 144' }}>
          Claim<span className="italic text-stamp">Court</span>
        </Link>
        <p className="mt-1 font-serif text-lg italic text-ink-2">
          Where two parties stake, two sets of exhibits are read, and a machine jury gives its reasons in writing.
        </p>
      </div>

      <nav className="rule-double mt-5 flex flex-wrap items-center justify-between gap-2 border-b border-ink py-2">
        <div className="flex gap-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`px-3 py-1 font-display text-lg ${path === n.href ? "bg-ink text-paper" : "hover:text-stamp"}`}
            >
              {n.label}
            </Link>
          ))}
        </div>
        {CONTRACT_ADDRESS && (
          <a className="typed text-[11px] text-ink-2 ink-link" href={addressExplorerUrl(CONTRACT_ADDRESS)} target="_blank" rel="noreferrer">
            Court contract {shortAddress(CONTRACT_ADDRESS)}
          </a>
        )}
      </nav>
    </header>
  );
}
