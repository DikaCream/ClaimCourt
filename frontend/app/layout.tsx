import type { Metadata, Viewport } from "next";
import { Courier_Prime, Fraunces, Newsreader } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { SITE_URL } from "@/lib/config";
import { Masthead } from "@/components/Masthead";
import { PendingTxs } from "@/components/PendingTxs";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap", axes: ["opsz"] });
const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-newsreader", display: "swap", style: ["normal", "italic"] });
const courier = Courier_Prime({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-courier", display: "swap" });

const title = "ClaimCourt: the on-chain docket of small claims";
const description =
  "A mini court on GenLayer. Two parties stake points and file evidence; AI validators read it, agree on a ruling with a quoted exhibit, and either side can appeal under a stricter standard.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title,
  description,
  applicationName: "ClaimCourt",
  icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }] },
  openGraph: { type: "website", url: "/", siteName: "ClaimCourt", title, description },
  twitter: { card: "summary", title, description },
};

export const viewport: Viewport = { themeColor: "#25211b" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${fraunces.variable} ${newsreader.variable} ${courier.variable}`}>
      <body>
        <Providers>
          <div className="mx-auto max-w-[1100px] px-2 py-4 sm:px-6 sm:py-8">
            <div className="sheet px-5 pb-10 pt-6 sm:px-14 sm:pl-24">
              <Masthead />
              <PendingTxs />
              <main>{children}</main>
              <footer className="mt-16 border-t border-ink pt-4 text-sm text-ink-2">
                <p className="typed text-[12px]">
                  ClaimCourt runs on GenLayer Studionet. Points have no monetary value. Rulings are produced by AI validators and
                  are not legal advice. See the <a className="ink-link" href="/rules">Local Rules</a> for the full trust model.
                </p>
              </footer>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
