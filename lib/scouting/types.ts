/**
 * Plain rows for the opposition scouting report (wave E, WP-1). The loader (`lib/match-store/scouting-read.ts`) turns stored
 * matches into these; everything in `lib/scouting/` is pure (no database, no Next) so each rule is unit tested on plain data.
 * Only opposition people are carried here: a club player never appears in a `ScoutMatch`.
 */
export type ScoutResult = 'won' | 'lost' | 'draw' | 'tie' | 'no_result' | 'abandoned'
export type ScoutBatStatus = 'out' | 'not_out' | 'did_not_bat' | 'unknown'

export type ScoutInnings = {
  seq: number
  clubBatting: boolean
  played: boolean
  /** Null when the team total is not recorded (an imported game). Never read as 0. */
  runs: number | null
  wickets: number | null
  allOut: boolean
  declared: boolean
  hasFow: boolean
}

export type ScoutPerson = { appearanceId: string; nameKey: string | null; displayName: string | null }

/** One opposition batter's innings. `fowWicket`/`fowRuns` are set when this batter was dismissed and the fall of wickets is stored. */
export type ScoutBat = {
  inningsSeq: number
  appearanceId: string
  position: number
  status: ScoutBatStatus | null
  runs: number
  balls: number | null
  fowWicket: number | null
  fowRuns: number | null
}

export type ScoutBowl = { inningsSeq: number; appearanceId: string; order: number; balls: number; runs: number; wickets: number }

export type ScoutMatch = {
  id: number
  gameId: string
  /** `yyyy-mm-dd`, null when unknown. */
  date: string | null
  season: string
  seasonYear: number | null
  grade: string | null
  venue: string | null
  isHome: boolean
  /** The club's result. */
  result: ScoutResult | null
  forfeit: boolean
  source: 'playhq' | 'import'
  tossChoice: 'bat' | 'bowl' | null
  clubWonToss: boolean | null
  innings: ScoutInnings[]
  people: ScoutPerson[]
  bat: ScoutBat[]
  bowl: ScoutBowl[]
}

/** A game ordered newest first; undated games sort last. */
export const newestFirst = (a: Pick<ScoutMatch, 'date' | 'id'>, b: Pick<ScoutMatch, 'date' | 'id'>): number =>
  (b.date ?? '').localeCompare(a.date ?? '') || b.id - a.id

/** Oldest first, for "last five" lines read left to right. */
export const oldestFirst = (a: Pick<ScoutMatch, 'date' | 'id'>, b: Pick<ScoutMatch, 'date' | 'id'>): number => newestFirst(b, a)
