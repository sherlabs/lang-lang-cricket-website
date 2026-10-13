import type { ScoutMatch } from './types'

export type TossSummary = {
  /** Games where the toss winner is recorded. */
  known: number
  /** Games they won the toss. */
  theyWon: number
  /** What they chose, among the tosses they won with a recorded choice. */
  chose: { bat: number; bowl: number }
  /** Tosses they won with no recorded choice. */
  choiceUnknown: number
  /** After they won the toss: our result in those games. */
  ourResultAfter: { won: number; lost: number; other: number }
}

/** Toss patterns (spec 3.1 item 4). A game whose toss is not recorded is left out, with `known` as the denominator. */
export function tossOf(matches: readonly ScoutMatch[]): TossSummary {
  const s: TossSummary = { known: 0, theyWon: 0, chose: { bat: 0, bowl: 0 }, choiceUnknown: 0, ourResultAfter: { won: 0, lost: 0, other: 0 } }
  for (const m of matches) {
    if (m.clubWonToss === null) continue
    s.known++
    if (m.clubWonToss) continue
    s.theyWon++
    if (m.tossChoice === 'bat') s.chose.bat++
    else if (m.tossChoice === 'bowl') s.chose.bowl++
    else s.choiceUnknown++
    if (m.result === 'won') s.ourResultAfter.won++
    else if (m.result === 'lost') s.ourResultAfter.lost++
    else s.ourResultAfter.other++
  }
  return s
}
