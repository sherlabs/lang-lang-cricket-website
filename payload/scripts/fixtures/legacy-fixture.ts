/**
 * Deterministic legacy (pre-Payload) fixture database.
 *
 * Recreates the 15 legacy `public.*` tables (DDL in ./legacy-schema.sql, exported
 * from the old drizzle schema) in a LOCAL Postgres and fills them with realistic
 * rows that exercise the ETL edge cases (spec §12): blob URLs with random
 * suffixes on the fake store host, `/assets/*` static URLs, duplicate basenames
 * across prefixes, orphan RSVPs/photos, one-time + recurring events with meal
 * options, yes/no RSVPs, pending/approved/rejected photos, stories in every
 * status with Tiptap JSON + HTML, PlayHQ/manual/hidden/override players with
 * honours, aliases of merged players, season rows, sync runs, every sponsor
 * tier, gallery, documents, contacts in every section, announcements, and
 * site_settings.sponsorCarouselTiers.
 *
 * Usage:
 *   pnpm fixture:legacy                      # LEGACY_DATABASE_URL from .env.local, schema public
 *   tsx payload/scripts/fixtures/legacy-fixture.ts --url <postgres url> [--schema legacy_fixture]
 *
 * Refuses any host other than 127.0.0.1 / localhost. Drops and recreates only the
 * legacy tables inside the target schema. Every value is fixed, so two runs give
 * byte-identical data.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { dbHostsOf, isLocalDbUrl } from '../../env'

export const FAKE_STORE_ID = 'fakestore'
export const BLOB_BASE = `https://${FAKE_STORE_ID}.public.blob.vercel-storage.com`
const blob = (pathname: string) => `${BLOB_BASE}/${pathname}`

export const LEGACY_TABLES = [
  'player_seasons',
  'player_honours',
  'player_aliases',
  'player_sync_runs',
  'players',
  'event_photos',
  'event_rsvps',
  'events',
  'stories',
  'announcements',
  'committee_contacts',
  'site_settings',
  'sponsors',
  'gallery_photos',
  'documents',
] as const

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>
/**
 * Bare `YYYY-MM-DD HH:MM:SS` strings, never JS Dates: node-postgres serialises a Date in the
 * machine's local zone and `timestamp` (no tz) columns drop the offset, so a Date would shift.
 */
const ts = (iso: string) => iso.replace('T', ' ').replace(/Z$/, '')
/** Fixed, UUID-shaped tokens (36 chars) so the fixture is deterministic. */
const tok = (n: number, kind: string) => {
  const hex = createHash('sha256').update(`${kind}:${n}`).digest('hex').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

const documents: Row[] = [
  { id: 1, category: 'Codes of Conduct', title: 'CCCA General Code of Conduct', url: '/assets/documents/ccca-general-code-of-conduct.pdf', created_at: ts('2025-08-01T00:00:00') },
  { id: 2, category: 'Policies', title: 'CCCA Extreme Weather Policy', url: '/assets/documents/ccca-extreme-weather-policy.pdf', created_at: ts('2025-08-01T00:00:01') },
  { id: 3, category: 'Child Safety', title: 'Safeguarding Children Policy', url: '/assets/documents/safeguarding-children-policy.pdf', created_at: ts('2025-08-01T00:00:02') },
  { id: 4, category: 'Game Day', title: 'Game Day Training Checklist', url: blob('documents/game-day-training-checklist-Qx7Lm2Pa9RtYb3Kd8WcZs1.pdf'), created_at: ts('2025-09-14T03:12:00') },
  { id: 6, category: 'CCCA Directory', title: 'CCCA Directory 2025/26', url: blob('documents/1726300000000-ccca-directory-25-26.pdf'), created_at: ts('2025-09-20T08:00:00') },
  // Outside the documents/ prefix: the ETL must take the collision/re-upload fallback and report it.
  { id: 9, category: 'Policies', title: 'Conflict Resolution Policy', url: blob('misc/llcc-conflict-resolution-policy-Hn4Tg6Vb2NcXz8QwEr5Ty0.pdf'), created_at: ts('2026-02-02T10:30:00') },
]

const galleryPhotos: Row[] = [
  { id: 1, url: '/assets/gallery/photo-01.jpg', caption: 'Grand final day', sort_order: 0, created_at: ts('2025-07-01T00:00:00') },
  { id: 2, url: '/assets/gallery/photo-02.jpg', caption: '', sort_order: 1, created_at: ts('2025-07-01T00:00:01') },
  { id: 3, url: blob('gallery/team-photo-Ab3De5Fg7Hi9Jk1Lm3No5Pq.jpg'), caption: 'Seniors 2025', sort_order: -2, created_at: ts('2026-01-10T05:00:00') },
  // Same basename as /assets/gallery/photo-01.jpg but a blob under gallery/.
  { id: 4, url: blob('gallery/photo-01.jpg'), caption: 'Re-uploaded classic', sort_order: -1, created_at: ts('2026-01-11T05:00:00') },
  { id: 7, url: blob('gallery/IMG_2041-Zy8Xw6Vu4Ts2Rq0Po8Nm6Lk.webp'), caption: 'Under 14s', sort_order: 2, created_at: ts('2026-03-02T01:00:00') },
]

const sponsors: Row[] = [
  { id: 1, tier: 'Platinum', name: 'Bendigo Bank – Community Bank Lang Lang', logo_url: '/assets/sponsors/bendigo-bank.webp', link_url: 'https://www.bendigobank.com.au', created_at: ts('2025-08-01T00:00:00') },
  { id: 2, tier: 'Gold', name: 'Vibe N Shine Clean Co', logo_url: '/assets/sponsors/vibe-and-shine.webp', link_url: '', created_at: ts('2025-08-01T00:00:01') },
  { id: 3, tier: 'Gold', name: 'Harbour Plumbing', logo_url: blob('sponsors/harbour-plumbing-Kd8WcZs1Qx7Lm2Pa9RtYb3.png'), link_url: 'https://example.com/harbour', created_at: ts('2026-01-05T00:00:00') },
  { id: 4, tier: 'Silver', name: 'Sunscape Solar', logo_url: '/assets/sponsors/sunscape-solar.webp', link_url: 'https://www.sunscapesolar.com.au', created_at: ts('2025-08-01T00:00:03') },
  // Duplicate basename "logo.png" across sponsors/ and contacts/ (and players/ below).
  { id: 5, tier: 'Bronze', name: 'Lang Lang Sands', logo_url: blob('sponsors/logo.png'), link_url: '', created_at: ts('2025-08-01T00:00:04') },
  { id: 6, tier: 'Player', name: 'Central Insurance Australia', logo_url: '/assets/sponsors/central-insurance.webp', link_url: '', created_at: ts('2025-08-01T00:00:05') },
  { id: 8, tier: 'Player', name: 'Sunscape Solar', logo_url: '/assets/sponsors/sunscape-solar.webp', link_url: 'https://www.sunscapesolar.com.au', created_at: ts('2025-08-01T00:00:06') },
]

const siteSettings: Row[] = [
  // Unknown tier + non-canonical order: readers must normalise.
  { key: 'sponsorCarouselTiers', value: JSON.stringify(['Gold', 'Platinum', 'Diamond']), updated_at: ts('2026-05-01T09:00:00') },
]

const committeeContacts: Row[] = [
  { id: 1, role: 'President', name: 'Alex Turner', phone: '0400 000 001', email: 'president@example.com', photo_url: blob('contacts/alex-turner-Pq5No3Lm1Kj9Ih7Gf5Ed3Cb.jpg'), section: 'committee', sort_order: 0, created_at: ts('2025-08-01T00:00:00') },
  { id: 2, role: 'Secretary', name: 'Jamie Lee', phone: '', email: 'secretary@example.com', photo_url: '', section: 'committee', sort_order: 1, created_at: ts('2025-08-01T00:00:01') },
  { id: 3, role: 'Treasurer', name: '  Sam Patel ', phone: '0400 000 003', email: '', photo_url: blob('contacts/logo.png'), section: 'committee', sort_order: 2, created_at: ts('2025-08-01T00:00:02') },
  { id: 4, role: 'Senior Captain', name: 'Chris Morgan', phone: '', email: '', photo_url: '', section: 'leadership', sort_order: 0, created_at: ts('2025-08-01T00:00:03') },
  { id: 5, role: 'Junior Coordinator', name: 'Taylor Brooks', phone: '0400 000 005', email: 'juniors@example.com', photo_url: blob('contacts/headshot.jpg'), section: 'leadership', sort_order: 1, created_at: ts('2025-08-01T00:00:04') },
  { id: 6, role: 'Under 12s Coach', name: 'Jordan Reid', phone: '', email: 'coach12@example.com', photo_url: '', section: 'coach', sort_order: 0, created_at: ts('2025-08-01T00:00:05') },
  { id: 8, role: 'Under 16s Coach', name: 'Morgan Ellis', phone: '0400 000 008', email: '', photo_url: '', section: 'coach', sort_order: 1, created_at: ts('2025-08-01T00:00:06') },
]

const announcements: Row[] = [
  { id: 1, title: 'Season launch night', body: 'Join us at the clubrooms on Friday.\n\nFood and drinks from 6pm.', published: true, created_at: ts('2026-09-01T02:00:00'), updated_at: ts('2026-09-02T02:00:00') },
  { id: 2, title: 'Training moves to Wednesdays', body: 'Seniors train Wednesdays 5:30pm from October.', published: true, created_at: ts('2026-09-20T02:00:00'), updated_at: ts('2026-09-20T02:00:00') },
  { id: 4, title: 'Draft: AGM notice', body: '', published: false, created_at: ts('2026-09-25T02:00:00'), updated_at: ts('2026-09-26T04:00:00') },
]

// Events: dates are "wall-clock as UTC" (timestamp without time zone at UTC midnight).
const events: Row[] = [
  {
    id: 3, type: 'one_time', title: 'Presentation Night 2026', description: 'End of season awards.\nDinner included.',
    location: 'Lang Lang Clubrooms', cover_image_url: blob('events/presentation-night-Gf5Ed3Cb1Az9Yx7Wv5Ut3Sr.jpg'),
    payment_link_label: 'Buy tickets', payment_link_url: 'https://example.com/tickets', meal_options: JSON.stringify(['Beef', 'Chicken', 'Vegetarian']),
    event_time: '18:30', event_date: ts('2026-09-12T00:00:00'), day_of_week: null, start_date: null, end_date: null, created_at: ts('2026-08-01T00:00:00'),
  },
  {
    id: 5, type: 'one_time', title: 'Junior Clinic', description: '', location: 'Main oval', cover_image_url: '/assets/branding/hero.jpg',
    payment_link_label: '', payment_link_url: '', meal_options: JSON.stringify([]),
    event_time: '09:00', event_date: ts('2026-11-21T00:00:00'), day_of_week: null, start_date: null, end_date: null, created_at: ts('2026-09-15T00:00:00'),
  },
  {
    id: 7, type: 'recurring', title: 'Tuesday Training', description: 'Seniors and U16s.', location: 'Nets', cover_image_url: '',
    payment_link_label: '', payment_link_url: '', meal_options: JSON.stringify([]),
    event_time: '17:30', event_date: null, day_of_week: 2, start_date: ts('2026-09-01T00:00:00'), end_date: ts('2026-12-15T00:00:00'), created_at: ts('2026-08-20T00:00:00'),
  },
  {
    id: 8, type: 'recurring', title: 'Friday Social Dinner', description: 'Members dinner after training.', location: 'Clubrooms',
    cover_image_url: blob('events/dinner.jpg'), payment_link_label: '', payment_link_url: '',
    meal_options: JSON.stringify(['Parma', 'Fish', 'Parma']), // duplicate kept verbatim (ETL must not normalise)
    event_time: '19:00', event_date: null, day_of_week: 5, start_date: ts('2026-10-02T00:00:00'), end_date: ts('2027-03-26T00:00:00'), created_at: ts('2026-09-01T00:00:00'),
  },
]

const eventRsvps: Row[] = [
  { id: 1, event_id: 3, occurrence_date: ts('2026-09-12T18:30:00'), name: 'Pat Doyle', email: 'pat@example.com', note: 'Bringing partner', response: 'yes', meal: 'Beef', edit_token: tok(1, 'rsvp'), created_at: ts('2026-08-10T01:00:00') },
  { id: 2, event_id: 3, occurrence_date: ts('2026-09-12T18:30:00'), name: 'Robin Shaw', email: '', note: '', response: 'no', meal: '', edit_token: tok(2, 'rsvp'), created_at: ts('2026-08-11T01:00:00') },
  { id: 3, event_id: 3, occurrence_date: ts('2026-09-12T18:30:00'), name: 'Casey Nguyen', email: '', note: '', response: 'yes', meal: 'Vegetarian', edit_token: tok(3, 'rsvp'), created_at: ts('2026-08-12T01:00:00') },
  // Pre-poll row: meal stored for a 'yes' that predates meals.
  { id: 4, event_id: 7, occurrence_date: ts('2026-10-06T17:30:00'), name: 'Drew Allen', email: 'drew@example.com', note: '', response: 'yes', meal: '', edit_token: tok(4, 'rsvp'), created_at: ts('2026-09-30T01:00:00') },
  { id: 5, event_id: 7, occurrence_date: ts('2026-10-13T17:30:00'), name: 'Drew Allen', email: 'drew@example.com', note: 'Late', response: 'no', meal: '', edit_token: tok(5, 'rsvp'), created_at: ts('2026-09-30T01:05:00') },
  { id: 6, event_id: 8, occurrence_date: ts('2026-10-09T19:00:00'), name: 'Lee Carter', email: '', note: '', response: 'yes', meal: 'Parma', edit_token: tok(6, 'rsvp'), created_at: ts('2026-10-01T01:00:00') },
  // Orphan: event 99 does not exist (ETL skips + reports).
  { id: 9, event_id: 99, occurrence_date: ts('2026-05-01T10:00:00'), name: 'Ghost Guest', email: '', note: '', response: 'yes', meal: '', edit_token: tok(9, 'rsvp'), created_at: ts('2026-04-20T01:00:00') },
]

const eventPhotos: Row[] = [
  { id: 1, event_id: 3, url: blob('events/presentation-1-Ut3Sr1Qp9On7Ml5Kj3Ih1Gf.jpg'), caption: 'Best and fairest', sort_order: 0, status: 'approved', submitter_name: '', created_at: ts('2026-09-13T01:00:00') },
  { id: 2, event_id: 3, url: blob('events/presentation-2-Ih1Gf9Ed7Cb5Az3Yx1Wv9Ut.jpg'), caption: '', sort_order: -1, status: 'approved', submitter_name: '', created_at: ts('2026-09-13T01:01:00') },
  { id: 3, event_id: 3, url: blob('events/pending/IMG_1234-Wv9Ut7Sr5Qp3On1Ml9Kj7Ih.jpg'), caption: 'From the back table', sort_order: 0, status: 'pending', submitter_name: 'Pat Doyle', created_at: ts('2026-09-14T01:00:00') },
  // Anomalous status (legacy app deleted rejects; the ETL must decide/report).
  { id: 4, event_id: 3, url: blob('events/pending/blurry-Kj7Ih5Gf3Ed1Cb9Az7Yx5Wv.jpg'), caption: '', sort_order: 0, status: 'rejected', submitter_name: 'Anon', created_at: ts('2026-09-14T02:00:00') },
  // Same basename as the cover image of event 8 (events/dinner.jpg) but under events/pending/.
  { id: 5, event_id: 3, url: blob('events/pending/dinner.jpg'), caption: 'Dinner', sort_order: 0, status: 'pending', submitter_name: '', created_at: ts('2026-09-14T03:00:00') },
  // Orphan: event 98 does not exist.
  { id: 8, event_id: 98, url: blob('events/orphan-Yx5Wv3Ut1Sr9Qp7On5Ml3Kj.jpg'), caption: 'Orphan', sort_order: 0, status: 'approved', submitter_name: '', created_at: ts('2026-03-01T01:00:00') },
]

// --- Stories (Tiptap JSON + the HTML the legacy app stored) ---------------
type PMNode = { type: string; attrs?: Record<string, unknown>; content?: PMNode[]; text?: string; marks?: { type: string; attrs?: Record<string, unknown> }[] }
const doc = (...content: PMNode[]): PMNode => ({ type: 'doc', content })
const p = (...content: PMNode[]): PMNode => ({ type: 'paragraph', content })
const h = (level: number, text: string): PMNode => ({ type: 'heading', attrs: { level }, content: [t(text)] })
const t = (text: string, marks?: PMNode['marks']): PMNode => (marks ? { type: 'text', text, marks } : { type: 'text', text })
const img = (src: string, alt: string | null = null): PMNode => ({ type: 'image', attrs: { src, alt, title: null } })
const link = (text: string, href: string): PMNode => t(text, [{ type: 'link', attrs: { href } }])

const storyPublished = {
  json: doc(
    h(2, 'The 1978 premiership'),
    p(t('It was a '), t('hot', [{ type: 'bold' }]), t(' day and the '), t('Lang Lang', [{ type: 'italic' }]), t(' side batted first.')),
    img(blob('stories/premiership-team-Ml3Kj1Ih9Gf7Ed5Cb3Az1Yx.jpg'), 'The 1978 team'),
    h(3, 'The chase'),
    { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('Openers out cheaply'))] }, { type: 'listItem', content: [p(t('A century from the No. 5'))] }] },
    { type: 'blockquote', content: [p(t('We never doubted it.'))] },
    p(t('Read more on the '), link('club history page', 'https://example.com/history'), t('.')),
    img('/assets/gallery/photo-02.jpg', 'Archive photo'),
    img('https://images.example.org/foreign.jpg', 'Foreign image'),
  ),
  html:
    '<h2>The 1978 premiership</h2><p>It was a <strong>hot</strong> day and the <em>Lang Lang</em> side batted first.</p>' +
    `<img src="${blob('stories/premiership-team-Ml3Kj1Ih9Gf7Ed5Cb3Az1Yx.jpg')}" alt="The 1978 team">` +
    '<h3>The chase</h3><ul><li><p>Openers out cheaply</p></li><li><p>A century from the No. 5</p></li></ul>' +
    '<blockquote><p>We never doubted it.</p></blockquote>' +
    '<p>Read more on the <a href="https://example.com/history">club history page</a>.</p>' +
    '<img src="/assets/gallery/photo-02.jpg" alt="Archive photo"><img src="https://images.example.org/foreign.jpg" alt="Foreign image">',
}
const storyPending = {
  json: doc(h(1, 'My first game'), p(t('I was twelve.')), img(blob('stories/pending/first-game-Cb3Az1Yx9Wv7Ut5Sr3Qp1On.jpg')), h(5, 'Small heading')),
  html: `<h1>My first game</h1><p>I was twelve.</p><img src="${blob('stories/pending/first-game-Cb3Az1Yx9Wv7Ut5Sr3Qp1On.jpg')}"><h5>Small heading</h5>`,
}
const storyRejected = {
  json: doc(p(t('Spam '), link('click here', 'javascript:alert(1)'))),
  html: '<p>Spam <a>click here</a></p>',
}
const storyAdmin = {
  // Blank lines (empty paragraphs) and a list typed as "3. " (orderedList start 3): both must render as before.
  json: doc(
    h(2, 'Ground history'), p(t('The ground opened in 1952.')), p(), p(),
    { type: 'orderedList', attrs: { start: 3 }, content: [{ type: 'listItem', content: [p(t('Third pitch laid 1990'))] }, { type: 'listItem', content: [p(t('Fourth pitch laid 2004'))] }] },
    { type: 'codeBlock', content: [t('scorebook page 4')] }, { type: 'horizontalRule' }, p(t('Updated 2026.')),
  ),
  html:
    '<h2>Ground history</h2><p>The ground opened in 1952.</p><p></p><p></p>' +
    '<ol start="3"><li><p>Third pitch laid 1990</p></li><li><p>Fourth pitch laid 2004</p></li></ol>' +
    '<pre><code>scorebook page 4</code></pre><hr><p>Updated 2026.</p>',
}

const stories: Row[] = [
  {
    id: 1, slug: 'the-1978-premiership', title: 'The 1978 premiership', excerpt: 'It was a hot day and the Lang Lang side batted first.',
    content_json: JSON.stringify(storyPublished.json), content_html: storyPublished.html, cover_image_url: blob('stories/cover-1978-On1Ml9Kj7Ih5Gf3Ed1Cb9Az.jpg'),
    author_name: 'Margaret Hill', author_email: 'margaret@example.com', submitted_by_admin: false, status: 'published',
    edit_token: tok(1, 'sedit'), view_token: tok(1, 'sview'), created_at: ts('2026-03-01T02:00:00'), published_at: ts('2026-03-03T04:00:00'), reviewed_at: ts('2026-03-03T04:00:00'),
  },
  {
    id: 2, slug: 'my-first-game', title: 'My first game', excerpt: '', content_json: JSON.stringify(storyPending.json), content_html: storyPending.html,
    cover_image_url: blob('stories/pending/cover-Az9Yx7Wv5Ut3Sr1Qp9On7Ml.jpg'), author_name: 'Tom Baker', author_email: 'tom@example.com',
    submitted_by_admin: false, status: 'pending', edit_token: tok(2, 'sedit'), view_token: tok(2, 'sview'),
    created_at: ts('2026-09-28T02:00:00'), published_at: null, reviewed_at: null,
  },
  {
    id: 3, slug: 'buy-cheap-stuff', title: 'Buy cheap stuff', excerpt: 'Spam', content_json: JSON.stringify(storyRejected.json), content_html: storyRejected.html,
    cover_image_url: '', author_name: 'Spammer', author_email: '', submitted_by_admin: false, status: 'rejected',
    edit_token: tok(3, 'sedit'), view_token: tok(3, 'sview'), created_at: ts('2026-04-01T02:00:00'), published_at: null, reviewed_at: ts('2026-04-02T02:00:00'),
  },
  {
    // Admin-written, published directly: reviewedAt null, empty excerpt, club as author.
    id: 5, slug: 'ground-history', title: 'Ground history', excerpt: '', content_json: JSON.stringify(storyAdmin.json), content_html: storyAdmin.html,
    cover_image_url: '/assets/branding/hero.jpg', author_name: 'Lang Lang Cricket Club', author_email: '', submitted_by_admin: true, status: 'published',
    edit_token: tok(5, 'sedit'), view_token: tok(5, 'sview'), created_at: ts('2025-11-01T02:00:00'), published_at: ts('2025-11-01T02:00:00'), reviewed_at: null,
  },
  {
    id: 6, slug: 'unpublished-memories', title: 'Unpublished memories', excerpt: 'Short', content_json: JSON.stringify(doc(p(t('Short')))), content_html: '<p>Short</p>',
    cover_image_url: '', author_name: 'Ann Lee', author_email: 'ann@example.com', submitted_by_admin: false, status: 'rejected',
    edit_token: tok(6, 'sedit'), view_token: tok(6, 'sview'), created_at: ts('2025-12-01T02:00:00'), published_at: ts('2025-12-02T02:00:00'), reviewed_at: ts('2026-01-05T02:00:00'),
  },
]

// --- Players ----------------------------------------------------------------
const players: Row[] = [
  { id: 1, slug: 'ben-smith', first_name: 'Ben', last_name: 'Smith', photo_url: blob('players/ben-smith-Sr1Qp9On7Ml5Kj3Ih1Gf9Ed.jpg'), bio: 'Opening bat.\n\nClub captain 2024.', source: 'playhq', manual_years: '', active_override: null, is_active_derived: true, hidden: false, created_at: ts('2025-10-01T00:00:00'), updated_at: ts('2026-09-30T00:00:00') },
  { id: 2, slug: 'ravi-kumar', first_name: 'Ravi', last_name: 'Kumar', photo_url: blob('players/logo.png'), bio: '', source: 'playhq', manual_years: '', active_override: 'active', is_active_derived: false, hidden: false, created_at: ts('2025-10-01T00:00:01'), updated_at: ts('2026-09-30T00:00:00') },
  { id: 3, slug: 'tom-oconnor', first_name: 'Tom', last_name: "O'Connor", photo_url: '', bio: '', source: 'playhq', manual_years: '', active_override: 'past', is_active_derived: true, hidden: false, created_at: ts('2025-10-01T00:00:02'), updated_at: ts('2026-09-30T00:00:00') },
  { id: 4, slug: 'hidden-player', first_name: 'Hidden', last_name: 'Player', photo_url: '', bio: '', source: 'playhq', manual_years: '', active_override: null, is_active_derived: true, hidden: true, created_at: ts('2025-10-01T00:00:03'), updated_at: ts('2026-09-30T00:00:00') },
  { id: 6, slug: 'bill-lawry', first_name: 'Bill', last_name: 'Lawry', photo_url: blob('players/headshot.jpg'), bio: 'Club legend.', source: 'manual', manual_years: '1978–1992', active_override: null, is_active_derived: false, hidden: false, created_at: ts('2025-11-01T00:00:00'), updated_at: ts('2025-11-02T00:00:00') },
  { id: 7, slug: 'ben-smith-2', first_name: 'Ben', last_name: 'Smith', photo_url: '', bio: '', source: 'manual', manual_years: '2001', active_override: 'past', is_active_derived: false, hidden: false, created_at: ts('2025-11-03T00:00:00'), updated_at: ts('2025-11-03T00:00:00') },
]

// Player 5 ("Benjamin Smith") was merged into player 1: its row is gone, its alias moved.
const playerAliases: Row[] = [
  { name_key: 'ben|smith', player_id: 1 },
  { name_key: 'benjamin|smith', player_id: 1 },
  { name_key: 'ravi|kumar', player_id: 2 },
  { name_key: "tom|o'connor", player_id: 3 },
  { name_key: 'thomas|oconnor', player_id: 3 },
  { name_key: 'hidden|player', player_id: 4 },
]

const playerHonours: Row[] = [
  { id: 1, player_id: 1, years: '2024', title: 'Club Champion', sort_order: 0 },
  { id: 2, player_id: 1, years: '2022–2023', title: 'Best Batter', sort_order: 1 },
  { id: 3, player_id: 6, years: '1978', title: 'Premiership Captain', sort_order: 0 },
  { id: 4, player_id: 6, years: '1985', title: 'Life Member', sort_order: 2 },
  { id: 5, player_id: 6, years: '1980', title: 'Best and Fairest', sort_order: 1 },
]

const season = (id: number, playerId: number, seasonName: string, seasonOrder: number, teamId: string, teamName: string, gradeName: string | null, s: Partial<Row> = {}): Row => ({
  id, player_id: playerId, season_name: seasonName, season_order: seasonOrder, team_id: teamId, team_name: teamName, grade_name: gradeName,
  games: 0, bat_innings: 0, bat_not_outs: 0, bat_runs: 0, bat_high_score: 0, bat_high_score_not_out: false, bat_balls: 0, bat_fours: 0, bat_sixes: 0,
  bowl_balls: 0, bowl_maidens: 0, bowl_runs: 0, bowl_wickets: 0, bowl_best_wickets: 0, bowl_best_runs: 0, catches: 0, ...s,
})
const playerSeasons: Row[] = [
  season(1, 1, 'Summer 2025/26', 0, 'team-a1', 'Lang Lang 1st XI', 'A Grade', { games: 10, bat_innings: 10, bat_not_outs: 1, bat_runs: 412, bat_high_score: 104, bat_high_score_not_out: true, bat_balls: 520, bat_fours: 45, bat_sixes: 6, catches: 4 }),
  season(2, 1, 'Summer 2024/25', 1, 'team-a0', 'Lang Lang 1st XI', 'A Grade', { games: 12, bat_innings: 12, bat_runs: 380, bat_high_score: 77, bat_balls: 600, bat_fours: 40, bat_sixes: 2, catches: 6 }),
  season(3, 2, 'Summer 2025/26', 0, 'team-a1', 'Lang Lang 1st XI', 'A Grade', { games: 9, bowl_balls: 480, bowl_maidens: 8, bowl_runs: 260, bowl_wickets: 21, bowl_best_wickets: 5, bowl_best_runs: 32, catches: 2 }),
  season(4, 2, 'Summer 2025/26', 0, 'team-b1', 'Lang Lang 2nd XI', null, { games: 1, bowl_balls: 36, bowl_runs: 20, bowl_wickets: 1, bowl_best_wickets: 1, bowl_best_runs: 20 }),
  season(5, 3, 'Summer 2023/24', 2, 'team-x9', 'Lang Lang 3rd XI', 'C Grade', { games: 5, bat_innings: 5, bat_runs: 60, bat_high_score: 22, bat_balls: 110 }),
  season(6, 4, 'Summer 2025/26', 0, 'team-b1', 'Lang Lang 2nd XI', 'B Grade', { games: 3, bat_innings: 3, bat_runs: 15, bat_high_score: 9, bat_balls: 30 }),
]

const playerSyncRuns: Row[] = [
  { id: 1, started_at: ts('2026-09-28T16:00:00'), finished_at: ts('2026-09-28T16:01:12'), status: 'ok', players_created: 4, season_rows: 6, error: null },
  { id: 2, started_at: ts('2026-09-29T16:00:00'), finished_at: ts('2026-09-29T16:00:03'), status: 'error', players_created: 0, season_rows: 0, error: 'PlayHQ 503 Service Unavailable' },
  // Stale lock: started, never finished.
  { id: 3, started_at: ts('2026-09-30T16:00:00'), finished_at: null, status: 'running', players_created: 0, season_rows: 0, error: null },
]

// Insert order respects FKs. Sequences are bumped past MAX(id) (+10) to model real-world gaps.
const DATA: [string, Row[]][] = [
  ['documents', documents],
  ['gallery_photos', galleryPhotos],
  ['sponsors', sponsors],
  ['site_settings', siteSettings],
  ['committee_contacts', committeeContacts],
  ['announcements', announcements],
  ['events', events],
  ['event_rsvps', eventRsvps],
  ['event_photos', eventPhotos],
  ['stories', stories],
  ['players', players],
  ['player_aliases', playerAliases],
  ['player_honours', playerHonours],
  ['player_seasons', playerSeasons],
  ['player_sync_runs', playerSyncRuns],
]

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

/** Every host pg could connect to (URL host, ?host=, ?hostaddr=) must be local. */
export function assertLocalUrl(url: string): void {
  if (!isLocalDbUrl(url)) {
    throw new Error(`legacy-fixture: refusing non-local host(s) ${dbHostsOf(url).join(', ')} (only 127.0.0.1 / localhost)`)
  }
}

/** Recreate the legacy tables in `schema` and load the fixture rows. */
export async function seedLegacyFixture(url: string, schema = 'public'): Promise<Record<string, number>> {
  assertLocalUrl(url)
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error(`legacy-fixture: bad schema name "${schema}"`)
  const here = path.dirname(fileURLToPath(import.meta.url))
  const ddl = readFileSync(path.join(here, 'legacy-schema.sql'), 'utf8').replaceAll('"public".', `"${schema}".`)

  const client = new pg.Client({ connectionString: url })
  await client.connect()
  const counts: Record<string, number> = {}
  try {
    await client.query('BEGIN')
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`)
    await client.query(`SET LOCAL search_path TO "${schema}"`)
    for (const table of LEGACY_TABLES) await client.query(`DROP TABLE IF EXISTS "${schema}"."${table}" CASCADE`)
    await client.query(ddl)
    for (const [table, rows] of DATA) {
      for (const row of rows) {
        const cols = Object.keys(row)
        const sql = `INSERT INTO "${schema}"."${table}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`
        await client.query(sql, cols.map((c) => row[c]))
      }
      counts[table] = rows.length
      if (rows.length && 'id' in rows[0]) {
        await client.query(`SELECT setval(pg_get_serial_sequence('"${schema}"."${table}"', 'id'), (SELECT MAX(id) FROM "${schema}"."${table}") + 10, true)`)
      }
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    await client.end()
  }
  return counts
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const url = arg('--url') ?? process.env.LEGACY_DATABASE_URL
  if (!url) {
    console.error('legacy-fixture: set LEGACY_DATABASE_URL or pass --url')
    process.exit(1)
  }
  const schema = arg('--schema') ?? 'public'
  seedLegacyFixture(url, schema)
    .then((counts) => {
      const u = new URL(url)
      console.log(`legacy fixture loaded into ${u.host}${u.pathname} schema ${schema}`)
      for (const [table, n] of Object.entries(counts)) console.log(`  ${table.padEnd(20)} ${n}`)
    })
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}
