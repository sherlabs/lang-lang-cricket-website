import type { Field, GlobalConfig } from 'payload'
import { anyone, isAdmin } from '../access'
import { hiddenFromEditors } from '../admin/visibility'
import { revalidatePaths } from '../hooks/revalidate'
import { clubDefaults as d, SEO_PAGES, SOCIAL_PLATFORMS, type SeoPage } from '../seed/club-defaults'

const PAGE_LABELS: Record<SeoPage, string> = {
  home: 'Home',
  sponsors: 'Sponsors',
  gallery: 'Gallery',
  documents: 'Documents',
  contact: 'Contact',
  people: 'Our People',
  announcements: 'Announcements',
  history: 'History',
  historySubmit: 'Share your story',
  events: 'Events',
  players: 'Players',
  fixtures: 'Fixtures',
  stats: 'Stats',
  records: 'Records',
  honours: 'Honours',
  compare: 'Compare players',
  statlab: 'StatLab',
  yearbooks: 'Yearbooks',
  matches: 'Match archive',
  news: 'News',
}

const FUNCTION_DEFAULTS: ReadonlySet<SeoPage> = new Set<SeoPage>(['news'])

const pageSeoFields: Field[] = SEO_PAGES.map((key) => ({
  name: key,
  label: PAGE_LABELS[key],
  type: 'group',
  fields: [
    // `news` (and any key added after it) uses function defaults, so no club copy lands in a SQL DEFAULT.
    // The keys before it keep their static defaults: switching them would rewrite existing columns.
    { name: 'title', type: 'text', defaultValue: FUNCTION_DEFAULTS.has(key) ? () => d.pages[key].title : d.pages[key].title },
    { name: 'description', type: 'textarea', defaultValue: FUNCTION_DEFAULTS.has(key) ? () => d.pages[key].description : d.pages[key].description },
  ],
}))

/**
 * Club identity and copy (spec §4.1) — the template's main seam. Field defaults come from
 * `payload/seed/club-defaults.ts`; the frontend reads it through `getClub()`, which merges
 * the saved global over the same defaults, so pages render identically before seeding.
 * Home, page copy and navigation stay defaults-module only in v1.
 */
export const Club: GlobalConfig = {
  slug: 'club',
  label: 'Club details',
  admin: { group: false, hidden: hiddenFromEditors, description: 'Club name, contact details, social links and page titles for search engines.' },
  access: { read: anyone, update: isAdmin },
  hooks: {
    afterChange: [
      async ({ doc, req }) => {
        // Every public page reads club values (nav, footer, metadata), including ISR routes
        // (/fixtures…) and the static global-not-found: revalidate the whole root layout.
        await revalidatePaths(['/'], req.context, [], { layout: true })
        return doc
      },
    ],
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Identity',
          fields: [
            { name: 'name', type: 'text', required: true, defaultValue: d.name },
            { name: 'shortName', type: 'text', defaultValue: d.shortName, admin: { description: 'Short form of the name, e.g. on the admin sign-in screen.' } },
            { name: 'tagline', type: 'text', defaultValue: d.tagline, admin: { description: 'Shown under the club name, e.g. the home ground location.' } },
            { name: 'sport', type: 'text', defaultValue: d.sport },
            {
              name: 'siteUrl',
              type: 'text',
              defaultValue: d.siteUrl,
              admin: { description: 'Canonical site URL (no trailing slash). Drives canonical links, the sitemap and structured data. When the CANONICAL_HOST environment variable is set (always, in production) that host is used instead of this value.' },
            },
            { name: 'logo', type: 'upload', relationTo: 'media', admin: { description: `Falls back to ${d.assets.logo}.` } },
            { name: 'locale', type: 'text', defaultValue: d.locale },
            { name: 'ogLocale', type: 'text', defaultValue: d.ogLocale },
          ],
        },
        {
          label: 'Contact & location',
          fields: [
            { name: 'email', type: 'email', defaultValue: d.email },
            { name: 'sponsorshipSubject', type: 'text', defaultValue: d.sponsorshipSubject },
            {
              name: 'address',
              type: 'group',
              fields: [
                { name: 'locality', type: 'text', defaultValue: d.address.locality },
                { name: 'region', type: 'text', defaultValue: d.address.region },
                { name: 'regionName', type: 'text', defaultValue: d.address.regionName },
                { name: 'country', type: 'text', defaultValue: d.address.country },
                { name: 'countryName', type: 'text', defaultValue: d.address.countryName },
              ],
            },
            { name: 'mapQuery', type: 'text', defaultValue: d.mapQuery, admin: { description: 'Google Maps search for the contact page map.' } },
          ],
        },
        {
          label: 'Socials',
          fields: [
            {
              name: 'socials',
              type: 'array',
              defaultValue: d.socials,
              admin: { description: 'An empty URL shows the label as plain text.' },
              fields: [
                { name: 'platform', type: 'select', required: true, options: [...SOCIAL_PLATFORMS] },
                { name: 'url', type: 'text', defaultValue: '' },
                { name: 'label', type: 'text', defaultValue: '' },
              ],
            },
          ],
        },
        {
          label: 'SEO',
          fields: [
            { name: 'defaultTitle', type: 'text', defaultValue: d.defaultTitle },
            { name: 'titleSuffix', type: 'text', defaultValue: d.titleSuffix },
            { name: 'defaultDescription', type: 'textarea', defaultValue: d.defaultDescription },
            { name: 'ogImage', type: 'upload', relationTo: 'media', admin: { description: `Falls back to ${d.assets.ogImage.url} (1200×630).` } },
            { name: 'ogImageAlt', type: 'text', defaultValue: d.ogImageAlt },
            { name: 'pages', type: 'group', fields: pageSeoFields },
          ],
        },
        {
          label: 'History',
          fields: [
            {
              name: 'history',
              type: 'group',
              fields: [
                {
                  name: 'narrative',
                  type: 'textarea',
                  defaultValue: d.history.narrative,
                  admin: { description: 'Separate paragraphs with a blank line.' },
                },
                { name: 'pullQuote', type: 'text', defaultValue: d.history.pullQuote },
                {
                  name: 'callout',
                  type: 'group',
                  fields: [
                    { name: 'eyebrow', type: 'text', defaultValue: d.history.callout.eyebrow },
                    { name: 'title', type: 'text', defaultValue: d.history.callout.title },
                    { name: 'body', type: 'text', defaultValue: d.history.callout.body },
                  ],
                },
              ],
            },
            { name: 'storySubmitIntro', type: 'textarea', defaultValue: d.storySubmitIntro },
          ],
        },
      ],
    },
  ],
}
