import 'server-only'
import { CLUB_LOCALE } from '@/config/site'
import { getClub } from '@/lib/club'
import { getYearbookMatchData } from '@/lib/match-store/yearbook-queries'
import { getStatsSettings } from '@/lib/site-settings'
import { boardContext, buildLeaderboard } from '@/lib/stats/leaderboard'
import { getMetric } from '@/lib/stats/metrics'
import { loadGamesForSeasonName } from '@/lib/matches-queries'
import { resultsByGradeFromLines, storedShare } from '@/lib/stats/match/yearbook'
import { effectiveCategories } from '@/lib/stats/query-string'
import { getHonourPlayers, getVisibleStatData } from '@/lib/stats/queries'
import { honoursForSeason } from '@/lib/stats/yearbook'
import type { YearbookFacts, YearbookRecord } from './yearbook-draft'

/**
 * The facts for one yearbook draft, from published data only (W2 spec 6.5): the stored season record and results by grade,
 * the leaders already shown on the public yearbook (visible players), highlights from match data (visible players) and the
 * honours entered for that season. Never opposition players, hidden players, emails, phones or bios; no PlayHQ call.
 */
const BOARDS = [
  { metric: 'runs', title: 'Most runs' },
  { metric: 'wickets', title: 'Most wickets' },
  { metric: 'catches', title: 'Most catches' },
  { metric: 'games', title: 'Most games' },
] as const

export async function gatherYearbookFacts(book: { seasonName: string; premiership: string | null }): Promise<YearbookFacts> {
  const [club, settings, data, honourPlayers] = await Promise.all([getClub(), getStatsSettings(), getVisibleStatData(), getHonourPlayers()])
  const cats = effectiveCategories({ cats: null, juniors: false }, settings.defaultIncludedCategories)
  const hasStats = data.rows.some((r) => r.seasonName === book.seasonName)

  const leaders = hasStats
    ? BOARDS.map((b) => {
        const metric = getMetric(b.metric)!
        const ctx = boardContext(metric)
        const lb = buildLeaderboard(data.rows, { season: book.seasonName, grade: 'all', metric: b.metric }, cats, settings)
        const entries = lb.result.ranked.filter((r) => r.rank <= 3).slice(0, 5).flatMap((r) => {
          const p = data.players.get(r.item.playerId)
          return p ? [{ name: p.name, value: `${r.display} ${metric.short}${ctx.text(r.item.counts) ? ` (${ctx.text(r.item.counts)})` : ''}` }] : []
        })
        return { board: b.title, entries }
      }).filter((l) => l.entries.length > 0)
    : []

  const match = await getYearbookMatchData(book.seasonName, { cats, rules: settings.gradeRules })
  const lines = match?.lines ?? []
  const empty = (): YearbookRecord => ({ played: 0, won: 0, lost: 0, drawn: 0, tied: 0, noResult: 0, unrecorded: 0, forfeitWins: 0, forfeitLosses: 0 })
  const byGrade = resultsByGradeFromLines(lines).map((g) => {
    const n = empty()
    for (const l of g.lines) {
      n.played++
      if (l.forfeit) {
        if (l.result === 'won') n.forfeitWins++
        else if (l.result === 'lost') n.forfeitLosses++
        else n.unrecorded++
      } else if (l.result === 'won') n.won++
      else if (l.result === 'lost') n.lost++
      else if (l.result === 'draw') n.drawn++
      else if (l.result === 'tie') n.tied++
      else if (l.result === 'no_result') n.noResult++
      else n.unrecorded++
    }
    return { grade: g.grade, ...n }
  })
  // The public yearbook only shows stored results when every finished game is stored; the draft follows the same rule,
  // so it never claims "won 6 of 10" for a 14 game season. Without a live list (PlayHQ unreadable) the count is stored as-is and labelled.
  const live = await loadGamesForSeasonName(book.seasonName).catch(() => null)
  const share = storedShare(lines, live && live.status === 'ok' ? live.games : null, { cats, rules: settings.gradeRules })
  const sum = (k: keyof YearbookRecord) => byGrade.reduce((s, g) => s + g[k], 0)
  const total = empty()
  for (const k of Object.keys(total) as (keyof YearbookRecord)[]) total[k] = sum(k)
  const record = byGrade.length && (share.complete || share.live === null) ? total : null

  const highlights: { text: string }[] = []
  if (match && match.set.matches.size > 0) {
    const best = [...match.set.bat].filter((b) => b.status !== 'unknown').sort((a, b) => b.runs - a.runs || a.m - b.m).slice(0, 3)
    for (const b of best) {
      const p = data.players.get(b.player)
      const h = match.set.matches.get(b.m)
      if (p && h && b.runs >= 50) highlights.push({ text: `${p.name} scored ${b.runs}${b.status === 'not_out' ? ' not out' : ''} against ${h.oppLabel}${h.date ? ` on ${h.date}` : ''}` })
    }
  }

  return {
    clubName: club.name,
    seasonName: book.seasonName,
    locale: CLUB_LOCALE,
    record,
    byGrade: record ? byGrade : [],
    coverage: { stored: share.stored, live: share.live, complete: share.complete },
    leaders,
    highlights,
    honours: honoursForSeason(honourPlayers, book.seasonName).map((h) => ({ player: h.name, title: h.title })),
    premiership: book.premiership?.trim() || null,
  }
}
