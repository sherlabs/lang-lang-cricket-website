import 'server-only'
import { CLUB_LOCALE } from '@/config/site'
import { getClub } from '@/lib/club'
import { getYearbookMatchData } from '@/lib/match-store/yearbook-queries'
import { getStatsSettings } from '@/lib/site-settings'
import { boardContext, buildLeaderboard } from '@/lib/stats/leaderboard'
import { getMetric } from '@/lib/stats/metrics'
import { resultLetter, resultsByGradeFromLines } from '@/lib/stats/match/yearbook'
import { effectiveCategories } from '@/lib/stats/query-string'
import { getHonourPlayers, getVisibleStatData } from '@/lib/stats/queries'
import { honoursForSeason } from '@/lib/stats/yearbook'
import type { YearbookFacts } from './yearbook-draft'

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
  const byGrade = resultsByGradeFromLines(lines).map((g) => {
    const n = { won: 0, lost: 0, drawn: 0, other: 0 }
    for (const l of g.lines) {
      const r = resultLetter(l)
      if (r === 'W') n.won++
      else if (r === 'L') n.lost++
      else if (r === 'D') n.drawn++
      else n.other++
    }
    return { grade: g.grade, played: g.lines.length, ...n }
  })
  const sum = (k: 'played' | 'won' | 'lost' | 'drawn' | 'other') => byGrade.reduce((s, g) => s + g[k], 0)
  const record = byGrade.length ? { played: sum('played'), won: sum('won'), lost: sum('lost'), drawn: sum('drawn'), other: sum('other') } : null

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
    byGrade,
    leaders,
    highlights,
    honours: honoursForSeason(honourPlayers, book.seasonName).map((h) => ({ player: h.name, title: h.title })),
    premiership: book.premiership?.trim() || null,
  }
}
