import type { Metadata } from "next";
import { FrontendShell } from "./shell";
import { getClub } from "@/lib/club";
import { baseOpenGraph } from "@/lib/site-metadata";

export async function generateMetadata(): Promise<Metadata> {
  const club = await getClub();
  return {
    metadataBase: new URL(club.siteUrl),
    title: {
      default: club.defaultTitle,
      template: "%s",
    },
    description: club.defaultDescription,
    openGraph: baseOpenGraph(club),
    twitter: {
      card: "summary_large_image",
      images: [club.ogImage.url],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <FrontendShell>{children}</FrontendShell>;
}
