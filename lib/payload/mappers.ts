/**
 * Payload doc → domain type (spec §14). Pure; no Payload runtime import.
 */
import type { Announcement, DocumentItem, Event, EventRsvp, GalleryPhoto, NavPage, NewsSummary, NewsView, PageBlock, PageView, Person, Player, PlayerSeason, Sponsor, Story, StoryContent, StoryStatus } from '@/lib/domain'
import type {
  Announcement as AnnouncementDoc,
  Document as DocumentDoc,
  Event as EventDoc,
  EventRsvp as EventRsvpDoc,
  GalleryPhoto as GalleryPhotoDoc,
  Media,
  News as NewsDoc,
  Page as PageDoc,
  Person as PersonDoc,
  Player as PlayerDoc,
  PlayerSeason as PlayerSeasonDoc,
  Sponsor as SponsorDoc,
  Story as StoryDoc,
} from '@/payload-types'

/** URL of a populated upload relation; '' for an unpopulated id, null or a file-less doc. */
export function mediaUrl(value: number | Media | null | undefined): string {
  return value && typeof value === 'object' ? (value.url ?? '') : ''
}

const date = (v: string | null | undefined) => new Date(v ?? 0)

/** Relationship value at any depth → id (0 when missing). */
const relId = (v: number | { id: number } | null | undefined) => (typeof v === 'number' ? v : (v?.id ?? 0))

export const toSponsor = (d: SponsorDoc): Sponsor => ({
  id: d.id,
  tier: d.tier,
  name: d.name,
  logoUrl: mediaUrl(d.logo),
  linkUrl: d.linkUrl ?? '',
  sortOrder: d.sortOrder ?? 0,
})

export const toPerson = (d: PersonDoc): Person => ({
  id: d.id,
  name: d.name,
  role: d.role,
  section: d.section ?? 'committee',
  moreRoles: (d.moreRoles ?? []).map((r) => ({ role: r.role, section: r.section ?? 'committee' })),
  phone: d.phone ?? '',
  email: d.email ?? '',
  photoUrl: mediaUrl(d.photo),
  sortOrder: d.sortOrder ?? 0,
  playerSlug: d.player && typeof d.player === 'object' && !d.player.hidden ? (d.player.slug ?? '') : '',
  playerId: relId(d.player),
  playerPhotoUrl: d.player && typeof d.player === 'object' ? mediaUrl(d.player.photo) : '',
})

export const toGalleryPhoto = (d: GalleryPhotoDoc): GalleryPhoto => ({
  id: d.id,
  url: d.url ?? '',
  caption: d.caption ?? '',
  sortOrder: d.sortOrder ?? 0,
  createdAt: date(d.createdAt),
})

export const toDocumentItem = (d: DocumentDoc): DocumentItem => ({
  id: d.id,
  title: d.title,
  category: d.category,
  url: d.url ?? '',
})

export const toAnnouncement = (d: AnnouncementDoc): Announcement => ({
  id: d.id,
  title: d.title,
  body: d.body ?? '',
  published: Boolean(d.published),
  createdAt: date(d.createdAt),
  updatedAt: date(d.updatedAt),
})

const dateOrNull = (v: string | null | undefined) => (v ? new Date(v) : null)

/** `[{ label }]` rows → strings (verbatim: ETL'd legacy lists keep their duplicates). */
const labels = (rows: EventDoc['mealOptions']) => (rows ?? []).map((r) => r.label).filter((l): l is string => typeof l === 'string' && l !== '')


export const toEvent = (d: EventDoc): Event => ({
  id: d.id,
  type: d.type,
  title: d.title,
  description: d.description ?? '',
  location: d.location ?? '',
  coverImageUrl: mediaUrl(d.cover),
  paymentLinkLabel: d.paymentLinkLabel ?? '',
  paymentLinkUrl: d.paymentLinkUrl ?? '',
  mealOptions: labels(d.mealOptions),
  eventTime: d.eventTime ?? '',
  eventDate: dateOrNull(d.eventDate),
  dayOfWeek: d.dayOfWeek == null ? null : Number(d.dayOfWeek),
  startDate: dateOrNull(d.startDate),
  endDate: dateOrNull(d.endDate),
  createdAt: date(d.createdAt),
  updatedAt: date(d.updatedAt),
})

export const toEventRsvp = (d: EventRsvpDoc): EventRsvp => ({
  id: d.id,
  eventId: relId(d.event),
  occurrenceDate: new Date(d.occurrenceDate),
  name: d.name,
  email: d.email ?? '',
  note: d.note ?? '',
  response: d.response === 'no' ? 'no' : 'yes',
  meal: d.meal ?? '',
  createdAt: date(d.createdAt),
})

const STORY_STATUSES: readonly StoryStatus[] = ['pending', 'published', 'rejected']

/** Never copies `editToken`, `viewToken` or `authorEmail` (spec §2). */
export const toStory = (d: StoryDoc): Story => ({
  id: d.id,
  slug: d.slug ?? '',
  title: d.title,
  excerpt: d.excerpt ?? '',
  content: (d.content as unknown as StoryContent | null) ?? null,
  coverImageUrl: mediaUrl(d.coverImage),
  authorName: d.authorName,
  status: STORY_STATUSES.includes(d.status as StoryStatus) ? (d.status as StoryStatus) : 'pending',
  submittedByAdmin: Boolean(d.submittedByAdmin),
  publishedAt: dateOrNull(d.publishedAt),
  reviewedAt: dateOrNull(d.reviewedAt),
  createdAt: date(d.createdAt),
  updatedAt: date(d.updatedAt),
})

const num = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

export const toPlayer = (d: PlayerDoc): Player => ({
  id: d.id,
  slug: d.slug ?? '',
  firstName: d.firstName,
  lastName: d.lastName ?? '',
  photoUrl: mediaUrl(d.photo),
  bio: d.bio ?? '',
  source: d.source === 'playhq' ? 'playhq' : 'manual',
  manualYears: d.manualYears ?? '',
  activeOverride: d.activeOverride === 'active' || d.activeOverride === 'past' ? d.activeOverride : null,
  isActiveDerived: Boolean(d.isActiveDerived),
  hidden: Boolean(d.hidden),
  createdAt: date(d.createdAt),
  updatedAt: date(d.updatedAt),
})

export const toPlayerSeason = (d: PlayerSeasonDoc): PlayerSeason => ({
  id: d.id,
  playerId: relId(d.player),
  seasonName: d.seasonName,
  seasonOrder: num(d.seasonOrder),
  teamId: d.teamId,
  teamName: d.teamName,
  gradeName: d.gradeName ?? null,
  games: num(d.games),
  batInnings: num(d.batInnings),
  batNotOuts: num(d.batNotOuts),
  batRuns: num(d.batRuns),
  batHighScore: num(d.batHighScore),
  batHighScoreNotOut: Boolean(d.batHighScoreNotOut),
  batBalls: num(d.batBalls),
  batFours: num(d.batFours),
  batSixes: num(d.batSixes),
  bowlBalls: num(d.bowlBalls),
  bowlMaidens: num(d.bowlMaidens),
  bowlRuns: num(d.bowlRuns),
  bowlWickets: num(d.bowlWickets),
  bowlBestWickets: num(d.bowlBestWickets),
  bowlBestRuns: num(d.bowlBestRuns),
  catches: num(d.catches),
})

const PAGE_PLACEMENTS = ['none', 'clubhouse', 'primary', 'footer']

/** Page blocks → render shape. An image block whose picture is not populated (or has no file) is dropped. */
function toPageBlocks(blocks: PageDoc['content']): PageBlock[] {
  const out: PageBlock[] = []
  for (const [i, b] of (blocks ?? []).entries()) {
    const id = b.id ?? String(i)
    if (b.blockType === 'text') out.push({ blockType: 'text', id, content: (b.richText as unknown as StoryContent | null) ?? null })
    else if (b.blockType === 'image') {
      const url = mediaUrl(b.image)
      if (url) out.push({ blockType: 'image', id, url, alt: b.alt ?? '', caption: b.caption ?? '', width: b.width ?? 'wide' })
    } else if (b.blockType === 'cta') {
      out.push({ blockType: 'cta', id, label: b.label, url: b.url, style: b.style ?? 'primary', note: b.note ?? '' })
    }
  }
  return out
}

export const toPageView = (d: PageDoc): PageView => ({
  id: d.id,
  slug: d.slug ?? '',
  title: d.title,
  status: d.status === 'published' ? 'published' : 'draft',
  publishedAt: dateOrNull(d.publishedAt),
  updatedAt: date(d.updatedAt),
  blocks: toPageBlocks(d.content),
  seoTitle: d.seoTitle ?? '',
  seoDescription: d.seoDescription ?? '',
  ogImageUrl: mediaUrl(d.ogImage),
})

export const toNavPage = (d: Pick<PageDoc, 'slug' | 'title' | 'navLabel' | 'showInNavigation' | 'navOrder'>): NavPage => ({
  slug: d.slug ?? '',
  title: d.title,
  navLabel: d.navLabel ?? '',
  showInNavigation: (PAGE_PLACEMENTS.includes(d.showInNavigation) ? d.showInNavigation : 'none') as NavPage['showInNavigation'],
  navOrder: typeof d.navOrder === 'number' && Number.isFinite(d.navOrder) ? d.navOrder : 100,
})

/** `excerpt` is the saved summary; the caller derives one from the body when it is empty. */
export const toNewsSummary = (d: NewsDoc, excerpt: string): NewsSummary => ({
  id: d.id,
  slug: d.slug ?? '',
  title: d.title,
  excerpt,
  coverUrl: mediaUrl(d.cover),
  publishedAt: new Date(d.publishedAt ?? d.createdAt),
})

export const toNewsView = (d: NewsDoc, excerpt: string): NewsView => ({
  ...toNewsSummary(d, excerpt),
  body: (d.body as unknown as StoryContent | null) ?? null,
  author: d.author ?? '',
  seoTitle: d.seoTitle ?? '',
  seoDescription: d.seoDescription ?? '',
  updatedAt: date(d.updatedAt),
})
