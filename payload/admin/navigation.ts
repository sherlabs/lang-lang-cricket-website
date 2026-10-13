/**
 * The admin menu, in one place. The sidebar (`components/AdminNav`), the dashboard tiles and
 * the "needs your attention" strip all read this file.
 *
 * Adding a collection:
 *  - Committee should see it: add an entry to `everydayNav` (and a tile in `jobTiles` if it is
 *    a common job), and leave `admin.hidden` off the collection.
 *  - Admins only: add an entry to `advancedNav` and set `admin.hidden: hiddenFromEditors`
 *    on the collection (or global).
 * Every entry needs a `group` (a heading from `navGroups`) and an `icon` key from the icon registry.
 * Every collection/global also needs `admin.group: false` (the sidebar is drawn here, not by
 * Payload's grouped nav) and plain-English `labels`.
 */
import type { IconKey } from '../components/ui/icons'

export type NavGroupKey = 'today' | 'website' | 'people' | 'office' | 'help' | 'advanced'

/**
 * Group headings for the sidebar (wave G WP-1). These are labels over the existing entries, never entries themselves: no key, no
 * path, nothing to click, so they cannot be "active" and do not count toward the everyday cap. A label must not repeat an entry's
 * label (`tests/admin-visibility.test.ts`).
 */
export const navGroups: Record<NavGroupKey, { label: string }> = {
  today: { label: 'Today' },
  website: { label: 'Club website' },
  people: { label: 'People' },
  office: { label: 'Running the club' },
  help: { label: 'Support' },
  advanced: { label: 'Advanced' },
}

/** Sub-headings inside Advanced. The player data screens sit together instead of being scattered through the list. */
export type NavSubgroupKey = 'player-data'
export const navSubgroups: Record<NavSubgroupKey, { label: string }> = {
  'player-data': { label: 'Player data' },
}

export type NavEntry = {
  /** Stable key (used for the DOM id and tests). */
  key: string
  label: string
  /** Path under the admin route, e.g. `/collections/events`. */
  path: string
  /** Extra path prefixes that should light this entry up (e.g. its create/edit pages). */
  matches?: string[]
  /** Optional pending-count badge key (see `badgeCounts` in AdminNav). */
  badge?: 'approvals'
  /** Advanced entries only: also shown to editors (the committee), not just admins. */
  forEditors?: boolean
  /** The heading it sits under. Entries of one group are contiguous in their list (tested). */
  group: NavGroupKey
  /** Advanced entries only: a sub-heading inside Advanced. */
  subgroup?: NavSubgroupKey
  /** A key of the icon registry (`payload/components/ui/icons.ts`). */
  icon: IconKey
}

export const everydayNav: NavEntry[] = [
  { key: 'home', label: 'Home', path: '', group: 'today', icon: 'home' },
  { key: 'approvals', label: 'Waiting for approval', path: '/approvals', badge: 'approvals', group: 'today', icon: 'approvals' },
  { key: 'events', label: 'Events', path: '/collections/events', group: 'website', icon: 'events' },
  { key: 'announcements', label: 'Announcements', path: '/collections/announcements', group: 'website', icon: 'announcements' },
  { key: 'news', label: 'News', path: '/collections/news', group: 'website', icon: 'news' },
  { key: 'photos', label: 'Photo gallery', path: '/collections/gallery-photos', group: 'website', icon: 'photos' },
  { key: 'sponsors', label: 'Sponsors', path: '/collections/sponsors', group: 'website', icon: 'sponsors' },
  { key: 'pages', label: 'Pages', path: '/collections/pages', group: 'website', icon: 'pages' },
  { key: 'documents', label: 'Documents', path: '/collections/documents', group: 'website', icon: 'documents' },
  { key: 'players', label: 'Players', path: '/collections/players', group: 'people', icon: 'players' },
  { key: 'people', label: 'Committee & contacts', path: '/collections/people', group: 'people', icon: 'people' },
  { key: 'player-sponsors', label: 'Player sponsors', path: '/collections/player-sponsors', group: 'people', icon: 'player-sponsors' },
  { key: 'club-apparel', label: 'Club apparel link', path: '/globals/club-apparel', group: 'people', icon: 'apparel' },
  // Wave D: ONE entry for the whole club back office (members, fees, volunteers, meetings, diary, email, stock); every module is a tile on its page, so the menu grows by one, not seven.
  { key: 'office', label: 'Club office', path: '/office', matches: ['/office'], group: 'office', icon: 'office' },
  { key: 'help', label: 'Help', path: '/help', group: 'help', icon: 'help' },
]

export const advancedNav: NavEntry[] = [
  { key: 'users', label: 'Users', path: '/collections/users', group: 'advanced', icon: 'users' },
  // Selectors are an occasional task, so they sit under Advanced; the committee reaches them here and from the Home tile.
  { key: 'selectors', label: 'Selectors', path: '/selectors', forEditors: true, group: 'advanced', icon: 'selectors' },
  // Posting a result is a weekly job for editors, so Social posts is reachable by them here and from a Home tile (wave C spec 3.6).
  { key: 'social', label: 'Social posts', path: '/social', forEditors: true, group: 'advanced', icon: 'social' },
  // The club fantasy game (wave F, issue #36): run a few times a year, so one Advanced entry for the whole view, no Home tile.
  { key: 'fantasy', label: 'Fantasy cricket', path: '/fantasy', forEditors: true, group: 'advanced', icon: 'fantasy' },
  // Occasional, editor-run content: kept out of the everyday list so it stays short on a phone, still reachable by the committee here and from Home tiles / approvals.
  { key: 'stories', label: 'Club history stories', path: '/collections/stories', forEditors: true, group: 'advanced', icon: 'stories' },
  { key: 'yearbooks', label: 'Season yearbooks', path: '/collections/yearbooks', forEditors: true, group: 'advanced', icon: 'yearbooks' },
  { key: 'social-settings', label: 'Social graphics settings', path: '/globals/social-settings', group: 'advanced', icon: 'settings' },
  { key: 'office-settings', label: 'Club office settings', path: '/globals/office-settings', group: 'advanced', icon: 'settings' },
  { key: 'selection-settings', label: 'Selection settings', path: '/globals/selection-settings', group: 'advanced', icon: 'settings' },
  { key: 'club', label: 'Club details', path: '/globals/club', group: 'advanced', icon: 'settings' },
  { key: 'site-settings', label: 'Site settings', path: '/globals/site-settings', group: 'advanced', icon: 'settings' },
  { key: 'theme', label: 'Site look (colours and fonts)', path: '/globals/theme', group: 'advanced', icon: 'theme' },
  { key: 'media', label: 'Media library', path: '/collections/media', group: 'advanced', icon: 'media' },
  { key: 'event-photos', label: 'Event photos', path: '/collections/event-photos', group: 'advanced', icon: 'photos' },
  { key: 'event-rsvps', label: 'RSVPs', path: '/collections/event-rsvps', group: 'advanced', icon: 'events' },
  { key: 'saved-reports', label: 'Saved reports', path: '/collections/saved-reports', group: 'advanced', icon: 'documents' },
  // Import and export of history, and the duplicate-players list: one advanced entry for both (W2 spec 6.1). With the player data screens below it, under one sub-heading.
  { key: 'player-data-tools', label: 'Player data tools', path: '/player-data-tools', group: 'advanced', subgroup: 'player-data', icon: 'data' },
  { key: 'player-aliases', label: 'Player aliases', path: '/collections/player-aliases', group: 'advanced', subgroup: 'player-data', icon: 'tag' },
  { key: 'player-seasons', label: 'Player seasons', path: '/collections/player-seasons', group: 'advanced', subgroup: 'player-data', icon: 'data' },
  { key: 'player-sync-runs', label: 'Sync runs', path: '/collections/player-sync-runs', group: 'advanced', subgroup: 'player-data', icon: 'data' },
]

/**
 * Collections written only by code (sync, scripts, seed), with no admin UI at all: hidden for every
 * role and never writable through REST. `tests/admin-visibility.test.ts` enforces both.
 */
export const internalCollections: string[] = ['matches', 'match-innings', 'match-appearances', 'match-batting', 'match-bowling', 'match-fielding', 'merge-log', 'ai-draft-counter', 'throttle-hits', 'auth-broker-jtis', 'fantasy-seasons', 'fantasy-round-state', 'fantasy-prices', 'fantasy-entries', 'fantasy-squads']

/**
 * Selection collections (announce-teams spec section 1): data the selectors work with, managed in the selector area, never as raw
 * rows in the admin. Hidden from the sidebar for every role, absent from both menus, and over REST readable by admins and editors
 * only (a selector is denied exactly like an anonymous visitor). `tests/admin-visibility.test.ts` enforces all of it.
 */
export const selectionCollections: string[] = ['player-selection-profiles', 'selection-fixtures', 'availability', 'squads', 'squad-members', 'team-sheets', 'best-player-ballots', 'net-sessions', 'net-attendance']

/**
 * Social queue collections (wave C spec 4.4): posts waiting to go out and their per-network targets. Hidden from the sidebar for
 * every role and absent from both menus; the committee reaches them only through the Social posts view. Over REST staff can read
 * (the lease fields never) and nobody can write: the composer's server actions and the publisher's SQL do all the writing.
 */
export const socialCollections: string[] = ['social-posts', 'social-post-targets']

/**
 * Club office collections (wave D spec 3.3): the back office's data. Never in a menu; the committee and admins reach them through the
 * Club office pages (`lib/office/modules.ts`). `admin` collections are hidden from editors with `hiddenFromEditors` (which also blocks
 * the native list and edit routes) and denied to them over REST; `staff` collections are open to the committee by access rules.
 * `tests/admin-visibility.test.ts` classifies each one.
 */
export type OfficeCollection = { slug: string; role: 'admin' | 'staff' }
export const officeCollections: OfficeCollection[] = [
  { slug: 'members', role: 'admin' },
  { slug: 'office-audit-log', role: 'admin' },
  { slug: 'membership-tiers', role: 'admin' },
  { slug: 'memberships', role: 'admin' },
  { slug: 'fee-seasons', role: 'admin' },
  { slug: 'fee-charges', role: 'admin' },
  { slug: 'fee-payments', role: 'admin' },
  { slug: 'fee-waivers', role: 'admin' },
  { slug: 'volunteer-weeks', role: 'staff' },
  { slug: 'volunteer-shifts', role: 'staff' },
  { slug: 'volunteer-assignments', role: 'staff' },
  { slug: 'volunteer-availability', role: 'staff' },
  // Per-person hours are employment information, so the ledger is admin only even though the rest of the roster is the committee's.
  { slug: 'volunteer-hours', role: 'admin' },
  // Meetings (WP-4): the committee reads unrestricted rows, office-bearers the rest; documents and files are office-bearer only (an editor
  // who holds a seat), so they stay un-hidden for editors and are guarded by access, not by hiding.
  { slug: 'committee-seats', role: 'staff' },
  { slug: 'meeting-templates', role: 'staff' },
  { slug: 'meetings', role: 'staff' },
  { slug: 'meeting-items', role: 'staff' },
  { slug: 'meeting-attendance', role: 'staff' },
  { slug: 'meeting-motions', role: 'staff' },
  { slug: 'meeting-actions', role: 'staff' },
  { slug: 'committee-documents', role: 'staff' },
  { slug: 'office-files', role: 'staff' },
  // Season diary and plan (WP-5): club figures, not personal data, so the committee edits them natively as the fallback to the Diary & plan pages.
  { slug: 'plan-pillars', role: 'staff' },
  { slug: 'plan-objectives', role: 'staff' },
  { slug: 'diary-jobs', role: 'staff' },
  // Stock and merch (WP-7): items are club figures the committee edits; the movements ledger and the issues are read-only (the Stock pages write them).
  { slug: 'stock-items', role: 'staff' },
  { slug: 'stock-movements', role: 'staff' },
  { slug: 'stock-issues', role: 'staff' },
  // Bulk email (WP-6): campaigns, per-address send rows and the unsubscribed list. Personal data, so admin only; the module is also hidden unless email is configured.
  { slug: 'email-campaigns', role: 'admin' },
  { slug: 'email-recipients', role: 'admin' },
  { slug: 'email-suppressions', role: 'admin' },
]

/** The sidebar a given role gets. Editors never receive `advancedNav`. */
export function navFor(role: string | null | undefined): { everyday: NavEntry[]; advanced: NavEntry[] } {
  const advanced = role === 'admin' ? advancedNav : role === 'editor' ? advancedNav.filter((e) => e.forEditors) : []
  return { everyday: everydayNav, advanced }
}

export type JobTile = { key: string; title: string; hint: string; path: string; icon: IconKey }

/** Big dashboard buttons: the jobs the committee does most. `path` is under the admin route. */
export const jobTiles: JobTile[] = [
  { key: 'event', title: 'Add an event', hint: 'Dinners, working bees, presentation days', path: '/collections/events/create', icon: 'events' },
  { key: 'announcement', title: 'Post an announcement', hint: 'Shows as a banner on the home page', path: '/collections/announcements/create', icon: 'announcements' },
  { key: 'photos', title: 'Add photos to the gallery', hint: 'Pick one or many pictures', path: '/collections/gallery-photos/create', icon: 'photos' },
  { key: 'sponsor', title: 'Add a sponsor', hint: 'Name, level and logo', path: '/collections/sponsors/create', icon: 'sponsors' },
  { key: 'player-sponsor', title: 'Add a player sponsor', hint: 'Link a business to a player', path: '/collections/player-sponsors/create', icon: 'player-sponsors' },
  { key: 'apparel', title: 'Change the apparel link', hint: 'Where the Club apparel button goes', path: '/globals/club-apparel', icon: 'apparel' },
  { key: 'contact', title: 'Update a contact', hint: 'Change a phone number, email or role', path: '/collections/people', icon: 'people' },
  { key: 'document', title: 'Upload a document', hint: 'Forms, policies and newsletters (PDF)', path: '/collections/documents/create', icon: 'documents' },
  { key: 'page', title: 'Add a page', hint: 'An info page such as About or Join us', path: '/collections/pages/create', icon: 'pages' },
  { key: 'news', title: 'Post news', hint: 'A news article with a picture', path: '/collections/news/create', icon: 'news' },
  { key: 'story', title: 'Write a club history story', hint: 'Or approve one sent in by a member', path: '/collections/stories/create', icon: 'stories' },
  { key: 'selector', title: 'Add a selector', hint: 'A login for someone who picks the teams', path: '/selectors', icon: 'selectors' },
  { key: 'social', title: 'Make a social post', hint: 'Results, line-ups, milestones and more', path: '/social', icon: 'social' },
  { key: 'help', title: 'Need a hand?', hint: 'Step-by-step help and who to call', path: '/help', icon: 'help' },
]

/** Pure helper (unit-tested): is `pathname` inside `entry`? Home matches only the admin root. */
export function isNavActive(entry: NavEntry, pathname: string, adminRoute: string): boolean {
  const base = `${adminRoute}${entry.path}`.replace(/\/$/, '') || '/'
  if (entry.path === '') return pathname === adminRoute || pathname === `${adminRoute}/`
  const prefixes = [base, ...(entry.matches ?? []).map((m) => `${adminRoute}${m}`)]
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export type NavSection = { key: string; label: string | null; entries: NavEntry[] }

/**
 * Pure (unit-tested): cut a menu list into the runs the sidebar draws under one heading. `by: 'group'` is the everyday list (a
 * heading per `navGroups` entry); `by: 'subgroup'` is Advanced (entries without a sub-heading come first, unlabelled). Order is the
 * array order, so a group must be contiguous in its list; `tests/admin-visibility.test.ts` checks that it is.
 */
export function navSections(entries: NavEntry[], by: 'group' | 'subgroup'): NavSection[] {
  const out: NavSection[] = []
  for (const e of entries) {
    const key = by === 'group' ? e.group : (e.subgroup ?? '')
    const label = by === 'group' ? navGroups[e.group].label : e.subgroup ? navSubgroups[e.subgroup].label : null
    const last = out[out.length - 1]
    if (last && last.key === key) last.entries.push(e)
    else out.push({ key, label, entries: [e] })
  }
  return out
}

/** Plain-English role names for the sidebar footer (never the raw role string). */
export function roleLabel(role: string | null | undefined): string {
  return role === 'admin' ? 'Site admin' : role === 'editor' ? 'Committee' : 'Member'
}
