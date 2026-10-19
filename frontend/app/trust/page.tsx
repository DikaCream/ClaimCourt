import { SectionTitle } from "@/components/ui";

const GH = "https://github.com/DikaCream/ClaimCourt/blob/main/docs/TRUST_MODEL.md";

export default function Trust() {
  return (
    <div className="max-w-3xl pt-8">
      <p className="label">Trust &amp; limits</p>
      <h1 className="font-display text-4xl font-semibold">What a ClaimCourt ruling proves, and what it does not</h1>

      <SectionTitle n="1.">Two different guarantees</SectionTitle>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="pleading p-4">
          <p className="label text-navy">Source-content integrity (provided)</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px]">
            <li>The text of an exhibit as of filing/response/appeal is fingerprinted (sha256) and the first 12,000 normalised characters are stored on-chain.</li>
            <li>Validators must independently reproduce the snapshot exactly; the stored text must equal the deterministic extract.</li>
            <li>Every ruling quote must literally exist in that text; validators re-derive the findings and must agree on them.</li>
            <li>Later edits to the page cannot change the case and are flagged.</li>
          </ul>
        </div>
        <div className="pleading p-4">
          <p className="label text-stamp">Real-world authenticity (NOT provided)</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px]">
            <li>Who actually published or controls a page (identity and provenance).</li>
            <li>That a page is truthful, complete or not forged before it was snapshotted.</li>
            <li>That a wallet belongs to the real person or business named in a claim.</li>
            <li>That parties are independent (one person can control both wallets).</li>
          </ul>
        </div>
      </div>
      <p className="mt-4">
        A ruling therefore states <i>what the submitted pages say and support</i>, not what happened in the world. Points have no monetary value. Any future use with real money would need stronger
        provenance (signed or notarised sources, archive/IPFS artifacts), identity or reputation for the parties, and a production settlement and validator-security design.
      </p>

      <SectionTitle n="2.">How rulings are checked</SectionTitle>
      <ul className="list-disc space-y-2 pl-6">
        <li>Structured findings (max 4): exhibit, verbatim quote, fact, supports CLAIMANT / RESPONDENT / NEUTRAL, one decisive finding.</li>
        <li>Validators agree on the ruling <b>and</b> on the material findings. Irrelevant quotes or contradictory support labels fail consensus even if the ruling labels match.</li>
        <li>Incomplete historical evidence blocks directional rulings (the court answers INCONCLUSIVE).</li>
        <li>An appeal that is never decided leaves the first ruling in force; only the bond depends on diligence (see the Local Rules table).</li>
      </ul>

      <SectionTitle n="3.">Immutable artifacts</SectionTitle>
      <p>For disputes that matter, submit exhibits that cannot change: an archive snapshot (web.archive.org, archive.ph), a content-addressed IPFS gateway URL, or a raw file pinned to a commit hash. The court stores a 12,000-character window and flags longer pages as truncated.</p>

      <p className="mt-6">
        Full document: <a className="ink-link text-stamp" href={GH} target="_blank" rel="noreferrer">docs/TRUST_MODEL.md</a> · <a className="ink-link text-stamp" href="/rules">Local Rules</a>.
      </p>
    </div>
  );
}
