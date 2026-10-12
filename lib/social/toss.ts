/**
 * Who won the toss, from the fields a stored match carries (written from the PlayHQ coin toss). Pure. Null when the winner is not
 * known or cannot be named, so the graphic is simply not offered for that game.
 */
export type TossRow = {
  clubWonToss?: boolean | null
  tossWinnerTeamId?: string | null
  clubTeamId?: string | null
  opponentTeamId?: string | null
}

export function tossWinnerSide(m: TossRow): 'club' | 'opponent' | null {
  if (m.clubWonToss === true) return 'club'
  if (m.clubWonToss === false) return 'opponent'
  const id = m.tossWinnerTeamId?.trim()
  if (!id) return null
  if (m.clubTeamId && id === m.clubTeamId) return 'club'
  if (m.opponentTeamId && id === m.opponentTeamId) return 'opponent'
  return null
}
