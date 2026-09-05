import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
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
        className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen flex-col antialiased`}
      >
        <SiteNav />
        <div className="flex-1">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
