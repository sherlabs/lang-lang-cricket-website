import type { Metadata } from "next";
import { FrontendShell } from "./shell";
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL, baseOpenGraph } from "@/lib/site-metadata";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: "%s",
  },
  description:
    "Lang Lang Cricket Club — junior and senior cricket in Caldermeade, Victoria. A welcoming community club for beginners through to experienced players.",
  openGraph: baseOpenGraph,
  twitter: {
    card: "summary_large_image",
    images: [DEFAULT_OG_IMAGE.url],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <FrontendShell>{children}</FrontendShell>;
}
