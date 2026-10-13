import { buildSeasonGlance, type GlanceFixture, type GlanceMatch, type SeasonGlance } from '@/lib/admin/season-glance'
import { DEFAULT_STATS_SETTINGS, resolveStatsSettings } from '@/lib/site-settings-core'
import { currentClubDate } from '@/lib/selection/club-date'
import { canonicalGrade, canonicalTeam } from '@/lib/stats/labels'
import { getLabelMap } from '@/lib/stats/label-queries'
import { getLastSyncAt } from '@/lib/stats/queries'
import type { Payload } from 'payload'

type MatchDoc = Record<string, unknown>
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

/**
 * Loads the stored data the Season-at-a-glance card needs and builds it. Stored data only: no PlayHQ call. Any failure returns null, so
 * the card is simply left out and the rest of Home still draws.
 */
export async function loadSeasonGlance(payload: Payload): Promise<SeasonGlance | null> {
  try {
    const top = await payload.find({ collection: 'matches', where: { and: [{ status: { equals: 'FINAL' } }, { seasonStartYear: { exists: true } }] }, sort: '-seasonStartYear', limit: 1, depth: 0, select: { seasonStartYear: true }, overrideAccess: true })
    const year = (top.docs[0] as MatchDoc | undefined)?.seasonStartYear
    if (typeof year !== 'number') return null
    const today = currentClubDate()
    const [games, upcoming, settingsDoc, labels, lastSync] = await Promise.all([
      payload.find({
        collection: 'matches', where: { and: [{ status: { equals: 'FINAL' } }, { seasonStartYear: { equals: year } }] }, pagination: false, depth: 0, overrideAccess: true,
        select: { gameId: true, localDate: true, seasonStartYear: true, gradeName: true, clubTeamName: true, opponentName: true, opponentOrgName: true, type: true, result: true, byForfeit: true, onFirstInnings: true, syncedAt: true },
      }),
      payload.find({
        collection: 'selection-fixtures', where: { and: [{ status: { equals: 'upcoming' } }, { localDate: { greater_than_equal: today } }] }, sort: 'localDate', limit: 50, depth: 0, overrideAccess: true,
        select: { gameId: true, gradeName: true, localDate: true, localTime: true, opponentName: true, isHome: true },
      }),
      payload.findGlobal({ slug: 'site-settings', depth: 0 }).catch(() => null),
      getLabelMap(),
      getLastSyncAt().catch(() => null),
    ])
    const matches = (games.docs as unknown as MatchDoc[]).map<GlanceMatch>((d) => ({
      gameId: String(d.gameId), localDate: str(d.localDate), seasonStartYear: typeof d.seasonStartYear === 'number' ? d.seasonStartYear : null,
      gradeName: str(d.gradeName), clubTeamName: str(d.clubTeamName), opponentName: str(d.opponentName), opponentOrgName: str(d.opponentOrgName), type: str(d.type),
      result: (str(d.result) as GlanceMatch['result']) ?? null, byForfeit: d.byForfeit === true, onFirstInnings: d.onFirstInnings === true,
    }))
    const fixtures = (upcoming.docs as unknown as MatchDoc[]).map<GlanceFixture>((d) => ({
      gameId: String(d.gameId), gradeName: str(d.gradeName), localDate: String(d.localDate), localTime: str(d.localTime), opponentName: String(d.opponentName ?? ''), isHome: d.isHome === true,
    }))
    // "As of": the last successful sync; a club without sync runs falls back to the newest write of a stored match.
    const written = (games.docs as unknown as MatchDoc[]).map((d) => (typeof d.syncedAt === 'string' ? Date.parse(d.syncedAt) : NaN)).filter(Number.isFinite)
    const asOf = lastSync ?? (written.length ? new Date(Math.max(...written)) : null)
    const settings = settingsDoc?.updatedAt ? resolveStatsSettings((settingsDoc as unknown as { stats?: unknown }).stats) : DEFAULT_STATS_SETTINGS
    return buildSeasonGlance({
      matches, fixtures, ladder: null, asOf, now: new Date(), today, rules: settings.gradeRules,
      gradeLabel: (g) => (g ? canonicalGrade(g, labels) : ''), teamLabel: (t) => (t ? canonicalTeam(t, labels) : ''),
    })
  } catch (err) {
    console.warn('[admin] season at a glance unavailable:', (err as Error).message)
    return null
  }
}
