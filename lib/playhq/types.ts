// ---- raw API ----
export type RawSeason = { id: string; name: string; status: 'UPCOMING' | 'ACTIVE' | 'COMPLETED'; competition: { id: string; name: string }; association: { id: string; name: string } }
export type RawTeam = { id: string; name: string; club: { id: string; name: string }; grade: { id: string; name: string; url?: string } | null }
export type RawCompetitor = { id: string; name: string; isHomeTeam: boolean; outcome?: string; scoreTotal?: number }
export type RawFixtureGame = {
  id: string; status: string; url: string; updatedAt: string
  grade: { id: string; name: string } | null
  round: { id: string; name: string; abbreviatedName: string; isFinalRound: boolean } | null
  schedule: { date: string; time: string | null; timezone: string } | null
  competitors: RawCompetitor[]
  venue: { name: string; surfaceName?: string; address?: { suburb?: string } } | null
}
export type RawStat = { type: string; value: number }
export type RawAppearance = { id: string; firstName: string; lastName: string; teamId: string; visible: boolean; roleType: string; captainRole: string | null }
export type RawPeriodAppearance = { id: string; displayOrder: number; status: string | null; statistics: RawStat[] }
export type RawPeriodTeam = { id: string; discipline: 'BATTING' | 'BOWLING'; status: string | null; statistics: RawStat[]; appearances: RawPeriodAppearance[]; fallOfWickets: { sequenceNo: number; appearanceId: string; runs: number }[] | null }
export type RawPeriod = { id: string; name: string; sequenceNo: number; teams: RawPeriodTeam[]; sharedStatistics: { type: string; appearances: { id: string; role: 'BATTING' | 'BOWLING' | 'FIELDING' }[] }[] }
export type RawGameSummary = {
  id: string; status: string; type: string
  grade: { id: string; name: string }; round: { name: string; abbreviatedName: string; isFinalRound: boolean } | null
  schedule: { day: number; dateTime: string }[]
  teams: { id: string; name: string; isHomeTeam: boolean; outcome: string | null; organisation: { id: string; name: string } }[]
  appearances: RawAppearance[]
  coinToss: { winningTeamId: string | null; preference: 'BAT' | 'BOWL' | null } | null
  periods: RawPeriod[]
  playingSurfaces: { name: string; venue: { name: string; timezone: string } }[]
}
export type RawLadder = { gradeId: string; ladders: { headers: { key: string; name: string; shortName: string }[]; standings: { team: { id: string; name: string }; values: (number | string | null)[] }[] }[] }

// ---- domain ----
export type SeasonGroup = { name: string; isJunior: boolean; seasons: { id: string; status: RawSeason['status']; competitionName: string; isJunior: boolean }[]; status: RawSeason['status'] }
export type ClubTeam = { id: string; name: string; seasonId: string; seasonName: string; competitionName: string; isJunior: boolean; gradeId: string | null; gradeName: string | null }
export type GameSide = { id: string; name: string; isHome: boolean; outcome: string | null; score: number | null }
export type Game = {
  id: string; status: string; url: string; gradeId: string | null; gradeName: string | null
  roundName: string | null; roundAbbr: string | null; isFinalRound: boolean
  localDate: string | null; localTime: string | null; sortKey: string   // `${date}T${time ?? '00:00:00'}`
  venueName: string | null; venueSuburb: string | null
  club: GameSide; opponent: GameSide          // club = the Lang Lang side
  isClubDerby: boolean                         // both sides are club teams
}
export type BattingLine = { appearanceId: string; name: string; dismissal: string; runs: number; balls: number; fours: number; sixes: number; strikeRate: number; notOut: boolean }
export type BowlingLine = { appearanceId: string; name: string; overs: number; maidens: number; runs: number; wickets: number; economy: number }
export type Innings = {
  sequenceNo: number; label: string            // "Nar Nar Goon B Grade — 1st innings"
  battingTeamId: string; battingTeamName: string; bowlingTeamId: string; bowlingTeamName: string
  batting: BattingLine[]; didNotBat: string[]; bowling: BowlingLine[]
  extras: { total: number; wides: number; noBalls: number; byes: number; legByes: number; penalty: number }
  total: { runs: number; wickets: number; overs: number; declared: boolean; allOut: boolean }
  fallOfWickets: { wicket: number; runs: number; name: string }[]
}
export type Scorecard = {
  id: string; status: string; type: string; gradeName: string; roundName: string | null
  venueName: string | null; startsAt: string | null   // ISO from schedule[0].dateTime
  teams: { id: string; name: string; isHome: boolean; outcome: string | null; isClub: boolean }[]
  toss: string | null                                  // "Lang Lang B Grade won the toss and elected to bowl"
  innings: Innings[]
  players: Record<string, { firstName: string; lastName: string; teamId: string }>   // appearanceId → player, visible only
}
export type PlayerSeasonStats = {
  key: string; name: string; games: number
  batting: { innings: number; notOuts: number; runs: number; highScore: number; highScoreNotOut: boolean; balls: number; fours: number; sixes: number; average: number | null; strikeRate: number | null }
  bowling: { balls: number; overs: string; maidens: number; runs: number; wickets: number; bestWickets: number; bestRuns: number; average: number | null; economy: number | null }
  catches: number
}
export type LadderRow = { teamId: string; teamName: string; position: number; isClub: boolean; values: Record<string, number | string | null> }
export type Ladder = { gradeId: string; headers: { key: string; name: string; shortName: string }[]; rows: LadderRow[] }
