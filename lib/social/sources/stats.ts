import 'server-only'
import { getStatsSettings } from '@/lib/site-settings'
import { buildLeaderboard, boardContext } from '@/lib/stats/leaderboard'
import { GRADE_CATEGORIES, CATEGORY_LABELS } from '@/lib/stats/categories'
import { getMetric, LEADERBOARD_METRIC_KEYS } from '@/lib/stats/metrics'
import { ALL } from '@/lib/stats/query-string'
import { milestoneBoard } from '@/lib/stats/milestone-board'
import { describeAchieved, describeApproaching, milestoneName, unitOf } from '@/lib/stats/milestones'
import { currentSeasonName, shortSeason } from '@/lib/stats/season-window'
import { getVisibleStatData } from '@/lib/stats/queries'
import { listPublishedYearbooks } from '@/lib/yearbooks-queries'
import { getYearbookMatchData } from '@/lib/match-store/yearbook-queries'
import { resultLetter } from '@/lib/stats/match/yearbook'
import type { LeadersData, LeadersParams } from '../specs/stats-leaders'
import type { MilestoneData, MilestoneParams } from '../specs/milestone'
import type { SeasonWrapData, SeasonWrapParams } from '../specs/season-wrap'
import type { SourceList } from '../types'
import { loadImageDataUri } from '@/lib/theme/og'
import { clubToday, loadSocialPlayers } from './shared'

/** The statistics offered on a leaders graphic: the handful people post about. */
const LEADER_METRICS = ['runs', 'wickets', 'catches', 'sixes', 'games'].filter((k) => LEADERBOARD_METRIC_KEYS.includes(k))

export async function leadersChoices(): Promise<SourceList> {
  const data = await getVisibleStatData()
  const current = currentSeasonName(data.rows)
  const choices: SourceList['choices'] = []
  for (const key of LEADER_METRICS) {
    const m = getMetric(key)
    if (!m) continue
    if (current) choices.push({ id: `${key}|${current}|default|5`, label: `${m.label}, ${shortSeason(current)}`, variants: [{ id: `${key}|${current}|default|5`, label: 'Top 5' }, { id: `${key}|${current}|default|3`, label: 'Top 3' }] })
    choices.push({ id: `${key}|${ALL}|default|5`, label: `${m.label}, all seasons`, variants: [{ id: `${key}|${ALL}|default|5`, label: 'Top 5' }, { id: `${key}|${ALL}|default|3`, label: 'Top 3' }] })
  }
  return { choices, empty: 'No statistics are available yet.' }
}

export async function loadLeaders(p: LeadersParams): Promise<LeadersData | null> {
  const metric = getMetric(p.metric)
  if (!metric || !LEADER_METRICS.includes(p.metric)) return null
  const [data, settings] = await Promise.all([getVisibleStatData(), getStatsSettings()])
  if (p.season !== ALL && !data.seasons.some((s) => s.seasonName === p.season)) return null
  const cats = p.cat === 'default' ? settings.defaultIncludedCategories : (GRADE_CATEGORIES as readonly string[]).includes(p.cat) ? [p.cat as (typeof GRADE_CATEGORIES)[number]] : null
  if (!cats) return null
  const board = buildLeaderboard(data.rows, { season: p.season, grade: ALL, metric: p.metric }, cats, settings)
  const players = await loadSocialPlayers(clubToday())
  const ctx = boardContext(metric)
  const rows = board.result.ranked
    .filter((r) => players.get(r.item.playerId)?.eligible === true)
    .slice(0, p.count)
    .map((r, i) => ({ rank: i + 1, name: data.players.get(r.item.playerId)?.name ?? players.get(r.item.playerId)!.name, value: r.display, context: `${ctx.text(r.item.counts)} ${ctx.label.toLowerCase()}` }))
  const scope = p.cat === 'default' ? '' : CATEGORY_LABELS[p.cat as keyof typeof CATEGORY_LABELS]
  return { metric: metric.label, seasonLabel: p.season === ALL ? 'All seasons' : shortSeason(p.season), scopeLabel: scope, rows }
}

type Entry = { playerId: number; name: string; key: MilestoneParams['key']; threshold: number; kind: 'achieved' | 'approaching'; detail: string }

async function milestoneEntries(): Promise<Entry[]> {
  const board = await milestoneBoard()
  const done: Entry[] = board.achievedNow.map((a) => ({ playerId: a.playerId, name: a.name, key: a.key, threshold: a.threshold, kind: 'achieved', detail: describeAchieved(a, board.windowLabel) }))
  const near: Entry[] = board.approaching.map((a) => ({ playerId: a.playerId, name: a.name, key: a.key, threshold: a.threshold, kind: 'approaching', detail: describeApproaching(a) }))
  return [...done, ...near]
}

export async function milestoneChoices(): Promise<SourceList> {
  const [entries, players] = await Promise.all([milestoneEntries(), loadSocialPlayers(clubToday())])
  const ok = entries.filter((e) => players.get(e.playerId)?.eligible === true)
  return { choices: ok.slice(0, 30).map((e) => ({ id: `${e.playerId}|${e.key}|${e.threshold}|${e.kind === 'achieved' ? 'a' : 'n'}`, label: `${e.name}: ${e.detail}` })), empty: 'No milestones to show right now.' }
}

export async function loadMilestone(p: MilestoneParams): Promise<MilestoneData | null> {
  // Only a real milestone from the board can be drawn, never an arbitrary claim from the address.
  const [entries, players] = await Promise.all([milestoneEntries(), loadSocialPlayers(clubToday())])
  const e = entries.find((x) => x.playerId === p.playerId && x.key === p.key && x.threshold === p.threshold && x.kind === p.kind)
  if (!e || players.get(e.playerId)?.eligible !== true) return null
  const [figure, ...rest] = milestoneName(e.key, e.threshold).split(' ')
  return { player: e.name, figure, unit: rest.join(' ') || unitOf(e.key, e.threshold), kind: e.kind, detail: p.text || e.detail }
}

export async function seasonWrapChoices(): Promise<SourceList> {
  const books = await listPublishedYearbooks()
  return { choices: books.slice(0, 10).map((b) => ({ id: b.slug, label: b.title })), empty: 'No yearbooks have been published yet.' }
}

export async function loadSeasonWrap(p: SeasonWrapParams): Promise<SeasonWrapData | null> {
  const book = (await listPublishedYearbooks()).find((b) => b.slug === p.slug)
  if (!book) return null
  const [settings, stats, players] = await Promise.all([getStatsSettings(), getVisibleStatData(), loadSocialPlayers(clubToday())])
  const rules = settings.gradeRules
  const match = await getYearbookMatchData(book.seasonName, { cats: settings.defaultIncludedCategories, rules })
  let record = ''
  if (match && match.lines.length) {
    const count = { W: 0, L: 0, D: 0, T: 0 }
    for (const l of match.lines) { const k = resultLetter(l); if (k === 'W' || k === 'L' || k === 'D' || k === 'T') count[k]++ }
    record = [`${count.W} ${count.W === 1 ? 'win' : 'wins'}`, `${count.L} ${count.L === 1 ? 'loss' : 'losses'}`, ...(count.D ? [`${count.D} drawn`] : [])].join(', ')
  }
  const top = (metricKey: string) => {
    if (!stats.seasons.some((s) => s.seasonName === book.seasonName)) return null
    const board = buildLeaderboard(stats.rows, { season: book.seasonName, grade: ALL, metric: metricKey }, settings.defaultIncludedCategories, settings)
    const first = board.result.ranked.find((r) => players.get(r.item.playerId)?.eligible === true)
    return first ? { name: stats.players.get(first.item.playerId)?.name ?? '', value: first.display } : null
  }
  const cover = book.coverUrl ? await loadImageDataUri(book.coverUrl, book.updatedAt) : null
  return { title: book.title, seasonLabel: shortSeason(book.seasonName), premiership: book.premiership, cover, record, topRuns: top('runs'), topWickets: top('wickets') }
}

