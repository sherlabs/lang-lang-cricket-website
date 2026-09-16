import type { BattingLine, BowlingLine, Innings, RawGameSummary, RawPeriod, RawPeriodTeam, RawStat, Scorecard } from './types'
import { displayName } from './names'

type Event = RawPeriod['sharedStatistics'][number]

const stat = (stats: RawStat[], type: string, fallback = 0) => stats.find((s) => s.type === type)?.value ?? fallback

export function dismissalText(event: Event | undefined, status: string | null, name: (id: string) => string): string {
  if (status === 'NOT_OUT') return 'not out'
  if (!event) return status === 'OUT' ? 'out' : ''
  const who = (role: string) => event.appearances.find((a) => a.role === role)?.id
  const bowler = who('BOWLING'), fielder = who('FIELDING')
  const b = bowler ? name(bowler) : '?'
  switch (event.type) {
    case 'CAUGHT':
      if (fielder && bowler && fielder === bowler) return `c & b ${b}`
      return `c ${fielder ? name(fielder) : '?'} b ${b}`
    case 'BOWLED': return `b ${b}`
    case 'LEG_BEFORE_WICKET': return `lbw b ${b}`
    case 'STUMPED': return `st ${fielder ? name(fielder) : '?'} b ${b}`
    case 'RUN_OUT': return fielder ? `run out (${name(fielder)})` : 'run out'
    case 'HIT_WICKET': return `hit wicket b ${b}`
    case 'RETIRED_HURT': return 'retired hurt'
    case 'RETIRED': return 'retired'
    case 'RETIRED_OUT': return 'retired out'
    default: return event.type.toLowerCase().replace(/_/g, ' ')
  }
}

const ordinal = (n: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : `${n}th`)

export function mapScorecard(raw: RawGameSummary, clubOrgId: string, isJunior: boolean): Scorecard {
  const players: Scorecard['players'] = {}
  // Fail closed: only visible Players. Coaches/officials are listed as appearances too.
  for (const a of raw.appearances) if (a.roleType === 'Player' && a.visible === true) players[a.id] = { firstName: a.firstName, lastName: a.lastName, teamId: a.teamId }
  const name = (id: string) => (players[id] ? displayName(players[id], isJunior) : 'Unknown')
  const teamName = (id: string) => raw.teams.find((t) => t.id === id)?.name ?? 'Unknown'

  const inningsCount = new Map<string, number>()
  const innings: Innings[] = [...raw.periods].sort((a, b) => a.sequenceNo - b.sequenceNo).map((p) => {
    const bat = p.teams.find((t) => t.discipline === 'BATTING') as RawPeriodTeam
    const bowl = p.teams.find((t) => t.discipline === 'BOWLING') as RawPeriodTeam
    const n = (inningsCount.get(bat.id) ?? 0) + 1
    inningsCount.set(bat.id, n)
    const eventFor = (id: string) => p.sharedStatistics.find((e) => e.appearances.some((a) => a.id === id && a.role === 'BATTING'))

    const batting: BattingLine[] = [], didNotBat: string[] = []
    for (const a of [...bat.appearances].sort((x, y) => x.displayOrder - y.displayOrder)) {
      if (!players[a.id]) continue
      if (a.status === 'DID_NOT_BAT' || (a.status === null && a.statistics.length === 0)) { didNotBat.push(name(a.id)); continue }
      batting.push({
        appearanceId: a.id, name: name(a.id), dismissal: dismissalText(eventFor(a.id), a.status, name),
        runs: stat(a.statistics, 'TOTAL_RUNS'), balls: stat(a.statistics, 'BALLS_FACED'),
        fours: stat(a.statistics, 'FOURS'), sixes: stat(a.statistics, 'SIXES'),
        strikeRate: stat(a.statistics, 'STRIKE_RATE'), notOut: a.status === 'NOT_OUT',
      })
    }
    const bowling: BowlingLine[] = bowl.appearances
      .filter((a) => players[a.id] && a.statistics.some((s) => s.type === 'OVERS' && s.value > 0))
      .sort((x, y) => x.displayOrder - y.displayOrder)
      .map((a) => ({
        appearanceId: a.id, name: name(a.id),
        overs: stat(a.statistics, 'OVERS'), maidens: stat(a.statistics, 'MAIDENS'), runs: stat(a.statistics, 'RUNS'),
        wickets: stat(a.statistics, 'WICKETS'), economy: stat(a.statistics, 'ECONOMY'),
      }))
    const s = bat.statistics
    return {
      sequenceNo: p.sequenceNo, label: `${teamName(bat.id)} — ${ordinal(n)} innings`,
      battingTeamId: bat.id, battingTeamName: teamName(bat.id), bowlingTeamId: bowl.id, bowlingTeamName: teamName(bowl.id),
      batting, didNotBat, bowling,
      extras: { total: stat(s, 'TOTAL_EXTRAS'), wides: stat(s, 'EXTRA_WIDES'), noBalls: stat(s, 'EXTRA_NO_BALLS'), byes: stat(s, 'EXTRA_BYES'), legByes: stat(s, 'EXTRA_LEG_BYES'), penalty: stat(s, 'EXTRA_PENALTY_RUNS') },
      total: { runs: stat(s, 'TOTAL_SCORE'), wickets: stat(s, 'TOTAL_OUTS'), overs: stat(s, 'TOTAL_OVERS'), declared: bat.status === 'DECLARED', allOut: bat.status === 'ALL_OUT' || stat(s, 'TOTAL_OUTS') >= 10 },
      fallOfWickets: (bat.fallOfWickets ?? [])
        .filter((f) => players[f.appearanceId])
        .map((f) => ({ wicket: f.sequenceNo, runs: f.runs, name: name(f.appearanceId) })),
    }
  })

  const toss = raw.coinToss?.winningTeamId
    ? `${teamName(raw.coinToss.winningTeamId)} won the toss${raw.coinToss.preference ? ` and elected to ${raw.coinToss.preference.toLowerCase()}` : ''}`
    : null

  return {
    id: raw.id, status: raw.status, type: raw.type, gradeName: raw.grade?.name ?? '', roundName: raw.round?.name ?? null,
    venueName: raw.playingSurfaces?.[0]?.venue?.name ?? null, startsAt: raw.schedule?.[0]?.dateTime ?? null,
    teams: raw.teams.map((t) => ({ id: t.id, name: t.name, isHome: t.isHomeTeam, outcome: t.outcome, isClub: t.organisation?.id === clubOrgId })),
    toss, innings, players,
  }
}

export function clubWickets(sc: Scorecard, clubTeamId: string) {
  const first = (teamId: string) => sc.innings.find((i) => i.battingTeamId === teamId)
  const club = first(clubTeamId)
  const opp = sc.innings.find((i) => i.battingTeamId !== clubTeamId)
  return {
    club: club ? club.total.wickets : null, opponent: opp ? opp.total.wickets : null,
    clubDeclared: club?.total.declared ?? false, opponentDeclared: opp?.total.declared ?? false,
  }
}

/**
 * PlayHQ returns placeholder 2nd innings for two-day games that never went there
 * (0 overs, 0 runs, two openers "not out 0"). Treat those as not played.
 */
export function isInningsPlayed(i: Innings): boolean {
  return i.total.overs > 0 || i.total.runs > 0 || i.total.wickets > 0 || i.batting.some((b) => b.balls > 0 || b.runs > 0)
}
