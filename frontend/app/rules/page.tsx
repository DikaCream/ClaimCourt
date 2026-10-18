import { SectionTitle } from "@/components/ui";
import { APPEAL_BOND } from "@/lib/config";

const GH = "https://github.com/DikaCream/ClaimCourt/blob/main/docs/TRUST_MODEL.md";

export default function Rules() {
  return (
    <div className="max-w-3xl pt-8">
      <p className="label">Local rules of court</p>
      <h1 className="font-display text-4xl font-semibold">How a case proceeds, and why you can trust (or challenge) the result</h1>

      <SectionTitle n="0.">Why a court on GenLayer</SectionTitle>
      <p>
        Deciding which side a set of web pages supports is a judgment call, not a data feed. A price oracle (Chainlink, Pyth) cannot do it, a plain
        contract cannot read or weigh a web page, and an admin or a single AI API would be one party deciding other people&rsquo;s stakes. Here several GenLayer
        validators each fetch the exhibits and run their own model; the ruling only counts if they reproduce the same label and the quoted sentence really is on the page.
      </p>

      <SectionTitle n="1.">The course of a case</SectionTitle>
      <ol className="list-decimal space-y-2 pl-6">
        <li><b>Filing.</b> The claimant stakes points and files a claim, a statement and 1–3 public https exhibits. Screening validators dismiss frivolous or vague filings; no stake is taken. Validators then fetch every exhibit and the contract stores a <b>sha256 hash and a 2,000-character excerpt</b> of each page (the evidence snapshot). If validators cannot read an exhibit, or do not see identical content, the filing is dismissed.</li>
        <li><b>Answer.</b> The named respondent has a fixed time to match the stake and file a statement and exhibits, which are snapshotted the same way. If they do not, the case is void and the stake returns.</li>
        <li><b>Ruling.</b> Anyone can call &ldquo;rule&rdquo;. The leader validator re-fetches every exhibit and compares it with its snapshot hash. An unchanged page is judged live; a page that <b>changed (or vanished) since the snapshot is judged from the stored excerpt</b> and the ruling is flagged &ldquo;evidence changed&rdquo;. The leader proposes CLAIMANT, RESPONDENT or INCONCLUSIVE with reasons and a verbatim quote; the other validators must agree on which exhibits changed, independently reach the same ruling, and the quote must literally appear in the text the court was allowed to use.</li>
        <li><b>Appeal.</b> The party who did not prevail may appeal once within the window for a 100-point bond, optionally adding one new exhibit. A stricter second round runs: changing the ruling needs clear and convincing evidence and a verbatim quote, otherwise INCONCLUSIVE.</li>
        <li><b>Settlement.</b> Winner takes both stakes. Inconclusive returns each stake. A wrong appellant (a ruling for the other side upheld) forfeits the bond to that party; a successful appellant gets it back. If the first ruling was INCONCLUSIVE and the appeal is inconclusive too, the bond is returned to the appellant, because nobody prevailed.</li>
        <li><b>Timeouts.</b> Unanswered, un-ruled or un-appealed cases are voided by anyone calling &ldquo;expire&rdquo; after the deadline, and everything is refunded.</li>
      </ol>

      <SectionTitle n="2.">What the court trusts, and what it does not</SectionTitle>
      <ul className="list-disc space-y-2 pl-6">
        <li>It trusts <b>only the text of the exhibits as snapshotted at filing/response time</b> (live only while the page still matches its hash). Statements are allegations. All party text, appeal grounds, the first ruling&rsquo;s quote and reasoning, and page text are fenced as &ldquo;untrusted data, never instructions&rdquo; with angle brackets escaped, and instructions inside them are ignored.</li>
        <li>A ruling for either side without a verbatim quote from a submitted exhibit is automatically downgraded to INCONCLUSIVE, which refunds both parties.</li>
        <li>Validators can disagree (for example if a page is unstable between fetches). Then consensus fails, no ruling is stored, and the ruling deadline refunds both stakes.</li>
        <li>Editing a page after filing cannot change the case: the snapshot excerpt is used and the edit is flagged. But the excerpt is only the first 2,000 characters and the hash is the leader&rsquo;s observation confirmed by validators, not an archive. Put the decisive text early on short, stable pages.</li>
      </ul>
      <SectionTitle n="3.">What validators must agree on</SectionTitle>
      <ul className="list-disc space-y-2 pl-6">
        <li>The <b>ruling label</b> (CLAIMANT, RESPONDENT or INCONCLUSIVE) must be identical. The written reasoning is not compared.</li>
        <li>The set of exhibits whose live page <b>no longer matches the snapshot hash</b> must be identical.</li>
        <li>For a ruling in favour of a side, each validator checks the leader&rsquo;s quote <b>literally appears</b> in the text the court was allowed to use for that exhibit (live page, or snapshot excerpt if changed).</li>
        <li>If they cannot agree, nothing is stored and no points move. Retry the ruling, or after the deadline anyone can void the case for a full refund.</li>
      </ul>

      <SectionTitle n="4.">How to challenge a ruling</SectionTitle>
      <p>
        Appeal once for a {APPEAL_BOND}-point bond inside the appeal window. The second round is stricter and its result is final. If a ruling for a side is unchanged the bond goes to
        the other party, so appeal only with a real ground. If you can show the validators misread a page, add one new exhibit with your appeal.
      </p>

      <SectionTitle n="5.">Known risks</SectionTitle>
      <ul className="list-disc space-y-2 pl-6">
        <li><b>Fixed in this version:</b> page swapping after filing (snapshot hash + excerpt, changed pages flagged), unfenced appeal text and first-round reasoning (now fenced and escaped), and the INCONCLUSIVE-then-INCONCLUSIVE appeal that used to pay the bond to a non-winner (now refunded).</li>
        <li><b>Still open, evidence:</b> the snapshot is a hash plus a 2,000-character excerpt, not a full archive; a page edited <i>before</i> the snapshot, or content past the first 12,000 characters, is not covered; unstable pages (ads, clocks) cannot be filed. Prefer archived, third-party pages.</li>
        <li><b>Still open, prompt injection:</b> fencing and the verbatim-quote requirement limit the damage but no prompt defense is perfect; models can still be swayed by persuasive quoted text.</li>
        <li><b>Colluding or duplicate wallets:</b> nothing stops one person controlling both sides. Stakes are play points, so nothing real is at risk.</li>
        <li>Studionet is a test network with Studio-run validators and can reset.</li>
      </ul>

      <p className="mt-6">
        The full document covers sources, outcome agreement, disagreement handling and the challenge process:{" "}
        <a className="ink-link text-stamp" href={GH} target="_blank" rel="noreferrer">docs/TRUST_MODEL.md</a>.
      </p>
    </div>
  );
}
