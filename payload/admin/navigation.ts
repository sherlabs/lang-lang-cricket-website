/**
 * The admin menu, in one place. The sidebar (`components/AdminNav`), the dashboard tiles and
 * the "needs your attention" strip all read this file.
 *
 * Adding a collection:
 *  - Committee should see it: add an entry to `everydayNav` (and a tile in `jobTiles` if it is
 *    a common job), and leave `admin.hidden` off the collection.
 *  - Admins only: add an entry to `advancedNav` and set `admin.hidden: hiddenFromEditors`
 *    on the collection (or global).
 * Every collection/global also needs `admin.group: false` (the sidebar is drawn here, not by
 * Payload's grouped nav) and plain-English `labels`.
 */
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
}

export const everydayNav: NavEntry[] = [
  { key: 'home', label: 'Home', path: '' },
  { key: 'events', label: 'Events', path: '/collections/events' },
  { key: 'announcements', label: 'Announcements', path: '/collections/announcements' },
  { key: 'photos', label: 'Photo gallery', path: '/collections/gallery-photos' },
  { key: 'sponsors', label: 'Sponsors', path: '/collections/sponsors' },
  { key: 'people', label: 'Committee & contacts', path: '/collections/people' },
  { key: 'documents', label: 'Documents', path: '/collections/documents' },
  { key: 'pages', label: 'Pages', path: '/collections/pages' },
  { key: 'news', label: 'News', path: '/collections/news' },
  { key: 'stories', label: 'Club history stories', path: '/collections/stories' },
  { key: 'yearbooks', label: 'Season yearbooks', path: '/collections/yearbooks' },
  { key: 'players', label: 'Players', path: '/collections/players' },
  { key: 'player-sponsors', label: 'Player sponsors', path: '/collections/player-sponsors' },
  { key: 'club-apparel', label: 'Club apparel link', path: '/globals/club-apparel' },
  { key: 'approvals', label: 'Waiting for approval', path: '/approvals', badge: 'approvals' },
  { key: 'help', label: 'Help', path: '/help' },
]

export const advancedNav: NavEntry[] = [
  { key: 'users', label: 'Users', path: '/collections/users' },
  { key: 'club', label: 'Club details', path: '/globals/club' },
  { key: 'site-settings', label: 'Site settings', path: '/globals/site-settings' },
  { key: 'theme', label: 'Site look (colours and fonts)', path: '/globals/theme' },
  { key: 'media', label: 'Media library', path: '/collections/media' },
  { key: 'event-photos', label: 'Event photos', path: '/collections/event-photos' },
  { key: 'event-rsvps', label: 'RSVPs', path: '/collections/event-rsvps' },
  { key: 'player-aliases', label: 'Player aliases', path: '/collections/player-aliases' },
  { key: 'player-seasons', label: 'Player seasons', path: '/collections/player-seasons' },
  { key: 'player-sync-runs', label: 'Sync runs', path: '/collections/player-sync-runs' },
  { key: 'saved-reports', label: 'Saved reports', path: '/collections/saved-reports' },
]

/**
 * Collections written only by code (sync, scripts, seed), with no admin UI at all: hidden for every
 * role and never writable through REST. `tests/admin-visibility.test.ts` enforces both.
 */
export const internalCollections: string[] = ['matches', 'match-innings', 'match-appearances', 'match-batting', 'match-bowling', 'match-fielding']

/** The sidebar a given role gets. Editors never receive `advancedNav`. */
export function navFor(role: string | null | undefined): { everyday: NavEntry[]; advanced: NavEntry[] } {
  return { everyday: everydayNav, advanced: role === 'admin' ? advancedNav : [] }
}

export type JobTile = { key: string; title: string; hint: string; path: string }

/** Big dashboard buttons: the jobs the committee does most. `path` is under the admin route. */
export const jobTiles: JobTile[] = [
  { key: 'event', title: 'Add an event', hint: 'Dinners, working bees, presentation days', path: '/collections/events/create' },
  { key: 'announcement', title: 'Post an announcement', hint: 'Shows as a banner on the home page', path: '/collections/announcements/create' },
  { key: 'photos', title: 'Add photos to the gallery', hint: 'Pick one or many pictures', path: '/collections/gallery-photos/create' },
  { key: 'sponsor', title: 'Add a sponsor', hint: 'Name, level and logo', path: '/collections/sponsors/create' },
  { key: 'player-sponsor', title: 'Add a player sponsor', hint: 'Link a business to a player', path: '/collections/player-sponsors/create' },
  { key: 'apparel', title: 'Change the apparel link', hint: 'Where the Club apparel button goes', path: '/globals/club-apparel' },
  { key: 'contact', title: 'Update a contact', hint: 'Change a phone number, email or role', path: '/collections/people' },
  { key: 'document', title: 'Upload a document', hint: 'Forms, policies and newsletters (PDF)', path: '/collections/documents/create' },
  { key: 'page', title: 'Add a page', hint: 'An info page such as About or Join us', path: '/collections/pages/create' },
  { key: 'news', title: 'Post news', hint: 'A news article with a picture', path: '/collections/news/create' },
  { key: 'story', title: 'Write a club history story', hint: 'Or approve one sent in by a member', path: '/collections/stories/create' },
  { key: 'help', title: 'Need a hand?', hint: 'Step-by-step help and who to call', path: '/help' },
]

/** Pure helper (unit-tested): is `pathname` inside `entry`? Home matches only the admin root. */
export function isNavActive(entry: NavEntry, pathname: string, adminRoute: string): boolean {
  const base = `${adminRoute}${entry.path}`.replace(/\/$/, '') || '/'
  if (entry.path === '') return pathname === adminRoute || pathname === `${adminRoute}/`
  const prefixes = [base, ...(entry.matches ?? []).map((m) => `${adminRoute}${m}`)]
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}
