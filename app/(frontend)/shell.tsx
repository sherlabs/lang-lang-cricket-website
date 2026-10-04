import { Inter } from "next/font/google";
import "./globals.css";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { ThemeStyle } from "@/components/theme-style";
import { getClub } from "@/lib/club";
import { getTheme } from "@/lib/theme";
import { HEADING_FONT_CLASSES, headingFontVar } from "@/lib/theme/font-faces";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});
/** The public site's <html> shell, shared by the (frontend) root layout and app/global-not-found.tsx. */
export async function FrontendShell({ children }: { children: React.ReactNode }) {
  const [club, theme] = await Promise.all([getClub(), getTheme()]);
  const nav = club.navigation;
  return (
    <html lang={club.locale}>
      <head>
        <ThemeStyle theme={theme} />
      </head>
      <body
        // The face variables are defined by the next/font classes on <body> itself, so the chosen one is
        // selected here (a :root declaration would resolve before they exist).
        style={{ "--font-heading": headingFontVar(theme.font.key) } as React.CSSProperties}
        className={`${inter.variable} ${HEADING_FONT_CLASSES} flex min-h-screen flex-col font-sans antialiased`}
      >
        <SiteNav
          club={{ name: club.name, tagline: club.tagline, logoUrl: theme.crest.url }}
          primaryLinks={nav.primaryNav}
          clubLinks={nav.clubhouseNav}
          clubLabel={nav.clubhouseLabel}
          cta={nav.navCta}
          apparel={club.apparel}
        />
        <div className="flex-1">{children}</div>
        <SiteFooter club={{ ...club, logoUrl: theme.crest.url }} />
      </body>
    </html>
  );
}
