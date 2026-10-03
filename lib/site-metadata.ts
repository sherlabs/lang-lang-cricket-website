import type { Metadata } from "next";
import { clubDefaults, type SeoPage } from "@/payload/seed/club-defaults";

/**
 * Pure metadata helpers. Club values come in as arguments (from `getClub()`), so these stay
 * testable; the constants below are the defaults-module values only (spec §14).
 */

/** Fields of the resolved club these helpers read (a `getClub()` result satisfies it). */
export type MetadataClub = {
  name: string;
  siteUrl: string;
  ogLocale: string;
  defaultTitle: string;
  titleSuffix: string;
  defaultDescription: string;
  ogImageAlt: string;
  ogImage: { url: string; width?: number; height?: number };
  pages: Record<SeoPage, { title: string; description: string }>;
};

export const SITE_URL = clubDefaults.siteUrl;
export const SITE_NAME = clubDefaults.name;

/** The share image every page uses unless it sets its own. */
export function defaultOgImage(club: Pick<MetadataClub, "ogImage" | "ogImageAlt">) {
  return { ...club.ogImage, alt: club.ogImageAlt };
}

/**
 * Open Graph block shared by every page. No og:title/description here on purpose:
 * Next doesn't derive them from each page's `title`, and a fixed site-wide value
 * made every shared link preview read the club name. Without them,
 * crawlers fall back to the page's own <title> and meta description.
 * A page that sets its own `openGraph` replaces this object, so spread it in.
 */
export function baseOpenGraph(club: Pick<MetadataClub, "name" | "ogLocale" | "ogImage" | "ogImageAlt">): NonNullable<Metadata["openGraph"]> {
  return {
    type: "website",
    siteName: club.name,
    locale: club.ogLocale,
    images: [defaultOgImage(club)],
  };
}

/** `<title>` for a page: `prefix` + the club's suffix (" | Club Name"). */
export function titleWithSuffix(club: Pick<MetadataClub, "titleSuffix">, prefix: string): string {
  return `${prefix}${club.titleSuffix}`;
}

/** Title and description for a page in the SEO tab (empty title → the site default). */
export function pageSeo(club: MetadataClub, page: SeoPage): { title: string; description: string } {
  const p = club.pages[page];
  return {
    title: p.title ? titleWithSuffix(club, p.title) : club.defaultTitle,
    description: p.description || club.defaultDescription,
  };
}

/** Collapse whitespace and trim to `max` chars on a word boundary, adding an ellipsis when cut. */
export function truncateDescription(text: string, max = 155): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const head = (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(
    /[\s,;:.!?-]+$/,
    "",
  );
  return `${head}…`;
}

/** `alternates` block with a canonical path (resolved against metadataBase). Query strings are never part of it. */
export function canonicalFor(path: string): { canonical: string } {
  return { canonical: path }
}

/** Resolve a site-relative path or absolute URL to an absolute URL on the canonical domain. */
export function absoluteUrl(pathOrUrl: string, siteUrl: string = SITE_URL): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  return `${siteUrl.replace(/\/+$/, '')}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`
}
