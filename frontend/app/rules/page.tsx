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
        <li><b>Filing.</b> The claimant stakes points and files a claim, a statement and 1–3 public https exhibits. Screening validators dismiss frivolous or vague filings; no stake is taken.</li>
        <li><b>Answer.</b> The named respondent has a fixed time to match the stake and file a statement and exhibits. If they do not, the case is void and the stake returns.</li>
        <li><b>Ruling.</b> Anyone can call &ldquo;rule&rdquo;. The leader validator fetches every exhibit and proposes CLAIMANT, RESPONDENT or INCONCLUSIVE with reasons and a verbatim quote. The other validators fetch the same pages and must independently reach the same ruling, and the quote must literally appear on the cited page.</li>
        <li><b>Appeal.</b> The party who did not prevail may appeal once within the window for a 100-point bond, optionally adding one new exhibit. A stricter second round runs: changing the ruling needs clear and convincing evidence and a verbatim quote, otherwise INCONCLUSIVE.</li>
        <li><b>Settlement.</b> Winner takes both stakes. Inconclusive returns each stake. A wrong appellant (ruling upheld) forfeits the bond to the other party; a successful appellant gets it back.</li>
        <li><b>Timeouts.</b> Unanswered, un-ruled or un-appealed cases are voided by anyone calling &ldquo;expire&rdquo; after the deadline, and everything is refunded.</li>
      </ol>

      <SectionTitle n="2.">What the court trusts, and what it does not</SectionTitle>
      <ul className="list-disc space-y-2 pl-6">
        <li>It trusts <b>only the text of the exhibits at the moment validators fetch them</b>. Statements are allegations. Instructions hidden in a page are ignored.</li>
        <li>A ruling for either side without a verbatim quote from a submitted exhibit is automatically downgraded to INCONCLUSIVE, which refunds both parties.</li>
        <li>Validators can disagree (for example if a page changes between fetches). Then consensus fails, no ruling is stored, and the ruling deadline refunds both stakes.</li>
        <li>Exhibits can be edited by whoever controls the page. Use archived, stable sources. This is the main residual risk and it is described honestly in the trust model.</li>
      </ul>
      <SectionTitle n="3.">What validators must agree on</SectionTitle>
      <ul className="list-disc space-y-2 pl-6">
        <li>The <b>ruling label</b> (CLAIMANT, RESPONDENT or INCONCLUSIVE) must be identical. The written reasoning is not compared.</li>
        <li>For a ruling in favour of a side, each validator re-fetches the cited page and checks the leader&rsquo;s quote <b>literally appears there</b>.</li>
        <li>If they cannot agree, nothing is stored and no points move. Retry the ruling, or after the deadline anyone can void the case for a full refund.</li>
      </ul>

      <SectionTitle n="4.">How to challenge a ruling</SectionTitle>
      <p>
        Appeal once for a {APPEAL_BOND}-point bond inside the appeal window. The second round is stricter and its result is final. If the ruling is unchanged the bond goes to
        the other party, so appeal only with a real ground. If you can show the validators misread a page, add one new exhibit with your appeal.
      </p>

      <SectionTitle n="5.">Known risks</SectionTitle>
      <ul className="list-disc space-y-2 pl-6">
        <li><b>Page swapping:</b> a party controlling an exhibit can change it after the other side has staked or before the ruling is called. Prefer archived or third-party pages and read the exhibits before you stake.</li>
        <li><b>Prompt injection:</b> pages and appeal grounds are untrusted text. The verbatim-quote requirement and INCONCLUSIVE fallback limit the damage but do not remove it.</li>
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
