import type { Metadata } from "next";
import { Inter, Barlow_Condensed } from "next/font/google";
import "./globals.css";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { SiteChrome } from "@/components/site-chrome";

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

export const metadata: Metadata = {
  metadataBase: new URL("https://lang-lang-cricket-website.vercel.app"),
  title: {
    default: "Lang Lang Cricket Club",
    template: "%s",
  },
  description:
    "Lang Lang Cricket Club — junior and senior cricket in Caldermeade, Victoria. A welcoming community club for beginners through to experienced players.",
  openGraph: {
    title: "Lang Lang Cricket Club",
    description: "Junior and senior cricket in Caldermeade, Victoria.",
    images: ["/assets/branding/hero.jpg"],
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${barlowCondensed.variable} flex min-h-screen flex-col font-sans antialiased`}
      >
        <SiteChrome>
          <SiteNav />
        </SiteChrome>
        <div className="flex-1">{children}</div>
        <SiteChrome>
          <SiteFooter />
        </SiteChrome>
      </body>
    </html>
  );
}
