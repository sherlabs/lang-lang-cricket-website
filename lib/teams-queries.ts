import 'server-only'
import { unstable_cache } from 'next/cache'
import type { Payload, Where } from 'payload'
import { CLUB_LOCALE } from '@/config/site'
import { getClub } from '@/lib/club'
import { getPayloadClient } from '@/lib/payload/client'
import { lineupText, type LineupPerson } from '@/lib/selection/lineup-text'
import { currentClubDate } from '@/lib/selection/club-date'
import { getSelectionSettings, idOf, type FixtureRow } from '@/lib/selection/store'
import { TEAMS_TAG } from '@/lib/selection/tags'
import { parseSnapshot, type Snapshot } from '@/lib/selection/team-sheet'
import { groupByWeekend, weekendKey } from '@/lib/selection/weekend'

/**
 * Public reads for `/teams` (announce-teams spec 5.4). The Local API ignores access rules, so every query states its filter here:
 * a sheet is public only while it has a published snapshot AND its game is not removed. A draft, an unpublished edit, a withdrawn
 * sheet and an unknown game id all give the same `null` (the page and the image route turn it into one identical 404). Only
 * `publishedSnapshot` is read for the team itself, so edits stay private until "Publish changes". Names are resolved here with
 * `hidden = false`; a player hidden since publishing shows as "Player name withheld" so batting positions stay honest.
 * Results are cached under the `teams` tag (publishing, withdrawing and hiding a player expire it) and for five minutes at most.
 */
export type PublicSlot = { order: number; name: string; slug: string | null; isCaptain: boolean; isKeeper: boolean; withheld: boolean; guest: boolean }
export type PublicTeam = {
  gameId: string
  gradeName: string
  roundName: string | null
  opponentName: string
  localDate: string
  localTime: string | null
  venueName: string | null
  venueSuburb: string | null
  isHome: boolean
  publishedAt: string
  /** Published more than once: the page says "Updated" and the image carries a small tag. */
  updated: boolean
  showOrder: boolean
  slots: PublicSlot[]
}

export const WITHHELD_NAME = 'Player name withheld'
const REVALIDATE_SECONDS = 300

/** `unstable_cache` needs a Next incremental cache; outside a Next request (tests, scripts) the loader simply runs. */
async function cached<T>(keyParts: string[], loader: () => Promise<T>): Promise<T> {
  try {
    return await unstable_cache(loader, ['teams', 'v1', ...keyParts], { tags: [TEAMS_TAG], revalidate: REVALIDATE_SECONDS })()
  } catch (err) {
    if (err instanceof Error && /incrementalCache missing/.test(err.message)) return loader()
    throw err
  }
}

type SheetDoc = { id: number; fixture: unknown; publishedAt?: string | null; publishCount?: number | null; publishedSnapshot?: unknown }

/** Published sheets whose game is a real, upcoming-or-final one. The filter lives here: published, game not removed. */
async function publishedRows(payload: Payload, fixtureWhere: Where): Promise<{ sheet: SheetDoc; snapshot: Snapshot; fixture: FixtureRow }[]> {
  const fixtures = await payload.find({ collection: 'selection-fixtures', where: { and: [fixtureWhere, { status: { not_equals: 'removed' } }] } as Where, limit: 1000, pagination: false, depth: 0, overrideAccess: true })
  if (!fixtures.docs.length) return []
  const byId = new Map(fixtures.docs.map((f) => [f.id, f as unknown as FixtureRow]))
  const sheets = await payload.find({
    collection: 'team-sheets',
    where: { and: [{ fixture: { in: [...byId.keys()] } }, { publishedAt: { exists: true } }] } as Where,
    limit: 1000,
    pagination: false,
    depth: 0,
    showHiddenFields: true,
    overrideAccess: true,
  })
  const out: { sheet: SheetDoc; snapshot: Snapshot; fixture: FixtureRow }[] = []
  for (const s of sheets.docs as unknown as SheetDoc[]) {
    const snapshot = parseSnapshot(s.publishedSnapshot)
    const fixture = byId.get(idOf(s.fixture) ?? -1)
    if (snapshot && fixture && s.publishedAt) out.push({ sheet: s, snapshot, fixture })
  }
  return out
}

/** Visible players only (`hidden = false`): anyone else is withheld. */
async function visiblePlayers(payload: Payload, ids: readonly number[]): Promise<Map<number, { name: string; slug: string }>> {
  const out = new Map<number, { name: string; slug: string }>()
  if (!ids.length) return out
  const res = await payload.find({ collection: 'players', where: { and: [{ id: { in: [...ids] } }, { hidden: { equals: false } }] } as Where, limit: ids.length, pagination: false, depth: 0, joins: false, select: { slug: true, firstName: true, lastName: true, displayName: true }, overrideAccess: true })
  for (const p of res.docs) out.set(p.id, { slug: p.slug ?? '', name: p.displayName?.trim() || `${p.firstName} ${p.lastName ?? ''}`.trim() })
  return out
}

async function toPublicTeams(payload: Payload, rows: Awaited<ReturnType<typeof publishedRows>>): Promise<PublicTeam[]> {
  const settings = await getSelectionSettings(payload)
  const ids = [...new Set(rows.flatMap((r) => r.snapshot.slots.map((s) => s.playerId).filter((n): n is number => n != null)))]
  const players = await visiblePlayers(payload, ids)
  return rows.map(({ sheet, snapshot, fixture }) => {
    const slots = snapshot.slots.map<PublicSlot>((s) => {
      if (s.playerId == null) return { order: s.order, name: s.guestName ?? '', slug: null, isCaptain: s.isCaptain, isKeeper: s.isKeeper, withheld: false, guest: true }
      const p = players.get(s.playerId)
      return { order: s.order, name: p?.name ?? WITHHELD_NAME, slug: p?.slug || null, isCaptain: s.isCaptain && Boolean(p), isKeeper: s.isKeeper && Boolean(p), withheld: !p, guest: false }
    })
    return {
      gameId: fixture.gameId,
      gradeName: fixture.gradeName,
      roundName: fixture.roundName,
      opponentName: fixture.opponentName,
      localDate: fixture.localDate,
      localTime: fixture.localTime,
      venueName: fixture.venueName,
      venueSuburb: fixture.venueSuburb,
      isHome: fixture.isHome,
      publishedAt: sheet.publishedAt!,
      updated: (sheet.publishCount ?? 1) > 1,
      showOrder: settings.publishBattingOrder,
      slots: settings.publishBattingOrder ? slots : [...slots].sort((a, b) => Number(a.withheld) - Number(b.withheld) || a.name.localeCompare(b.name)),
    }
  })
}

/** The uncached read the publish step uses (a cached read could still hold the previous version inside the same request). */
export async function readPublishedTeams(payload: Payload, fixtureWhere: Where): Promise<PublicTeam[]> {
  return toPublicTeams(payload, await publishedRows(payload, fixtureWhere))
}

/** One published team, or null for anything else (draft, withdrawn, removed game, unknown id). */
export async function getPublishedTeam(gameId: string): Promise<PublicTeam | null> {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(gameId)) return null
  return cached(['game', gameId], async () => {
    const payload = await getPayloadClient()
    return (await toPublicTeams(payload, await publishedRows(payload, { gameId: { equals: gameId } })))[0] ?? null
  })
}

export type PublicWeekend = { weekendKey: string; teams: PublicTeam[] }

/**
 * The weekend `/teams` shows: the current or next weekend that has a published team, else the most recent one. A weekend is a
 * Monday-to-Sunday week keyed by its Saturday (`lib/selection/weekend.ts`).
 */
export async function getPublishedWeekend(today: string = currentClubDate()): Promise<PublicWeekend | null> {
  return cached(['weekend', today], async () => {
    const payload = await getPayloadClient()
    const teams = await toPublicTeams(payload, await publishedRows(payload, { localDate: { exists: true } }))
    const groups = groupByWeekend(teams)
    if (!groups.length) return null
    const now = weekendKey(today)
    const pick = groups.find((g) => g.key >= now) ?? groups[groups.length - 1]
    return { weekendKey: pick.key, teams: [...pick.rows].sort((a, b) => a.localDate.localeCompare(b.localDate) || (a.localTime ?? '').localeCompare(b.localTime ?? '') || a.gradeName.localeCompare(b.gradeName)) }
  })
}

/** Published, non-removed games of the last `days` days or later, for the sitemap. */
export async function listPublishedGamesForSitemap(days = 60, now: Date = new Date()): Promise<{ gameId: string; lastModified: Date }[]> {
  const payload = await getPayloadClient()
  const cutoff = new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10)
  const rows = await publishedRows(payload, { localDate: { greater_than_equal: cutoff } })
  return rows.map((r) => ({ gameId: r.fixture.gameId, lastModified: new Date(r.sheet.publishedAt!) }))
}

/** The copy-ready Facebook post for a published team (club name, sign-off and site address come from the club settings). */
export async function postTextFor(team: PublicTeam): Promise<string> {
  const club = await getClub()
  const people: LineupPerson[] = team.slots.map((s) => ({ name: s.name, isCaptain: s.isCaptain, isKeeper: s.isKeeper }))
  return lineupText({
    clubName: club.shortName || club.name,
    gradeName: team.gradeName,
    opponent: team.opponentName,
    localDate: team.localDate,
    localTime: team.localTime,
    venue: team.venueName,
    people,
    showOrder: team.showOrder,
    signOff: club.teamsSignOff,
    siteUrl: club.siteUrl,
    updated: team.updated,
    locale: club.locale || CLUB_LOCALE,
  })
}
