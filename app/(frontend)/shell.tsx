import { Inter, Barlow_Condensed } from "next/font/google";
import "./globals.css";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { getClub } from "@/lib/club";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});
const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  variable: "--font-heading",
  weight: ["500", "600", "700"],
  display: "swap",
});

/** The public site's <html> shell, shared by the (frontend) root layout and app/global-not-found.tsx. */
export async function FrontendShell({ children }: { children: React.ReactNode }) {
  const club = await getClub();
  const nav = club.navigation;
  return (
    <html lang={club.locale}>
      <body
        className={`${inter.variable} ${barlowCondensed.variable} flex min-h-screen flex-col font-sans antialiased`}
      >
        <SiteNav
          club={{ name: club.name, tagline: club.tagline, logoUrl: club.logoUrl }}
          primaryLinks={nav.primaryNav}
          clubLinks={nav.clubhouseNav}
          clubLabel={nav.clubhouseLabel}
          cta={nav.navCta}
        />
        <div className="flex-1">{children}</div>
        <SiteFooter club={club} />
      </body>
    </html>
  );
}
