import 'server-only'
import { getPayloadClient } from '@/lib/payload/client'
import type { Match } from '@/payload-types'
import { getLabelMap } from '@/lib/stats/label-queries'
import { canonicalGrade, type LabelMap } from '@/lib/stats/labels'
import type { TossData, TossParams } from '../specs/toss'
import { tossWinnerSide } from '../toss'
import type { SourceList } from '../types'
import { clubNames, dayLabel } from './shared'

const RECENT = 40
const FIELDS = {
  gameId: true, status: true, gradeName: true, roundName: true, localDate: true, venueName: true, venueSuburb: true, clubTeamId: true, opponentTeamId: true,
  opponentName: true, opponentOrgName: true, tossWinnerTeamId: true, tossChoice: true, clubWonToss: true,
} as const

type MatchDoc = Pick<Match, keyof typeof FIELDS | 'id'>

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const opponentOf = (m: MatchDoc): string => str(m.opponentOrgName) || str(m.opponentName) || 'the opposition'

function toData(m: MatchDoc, club: string, labels: LabelMap): TossData | null {
  const side = tossWinnerSide({ clubWonToss: m.clubWonToss, tossWinnerTeamId: str(m.tossWinnerTeamId) || null, clubTeamId: str(m.clubTeamId) || null, opponentTeamId: str(m.opponentTeamId) || null })
  if (!side) return null
  const opponent = opponentOf(m)
  return {
    winner: side === 'club' ? club : opponent,
    clubWon: side === 'club',
    choice: m.tossChoice === 'bat' || m.tossChoice === 'bowl' ? m.tossChoice : null,
    opponent,
    grade: canonicalGrade(str(m.gradeName) || null, labels),
    round: str(m.roundName) || null,
    dateLabel: dayLabel(str(m.localDate)),
    venue: [str(m.venueName), str(m.venueSuburb)].filter(Boolean).join(', '),
  }
}

/** The newest finished stored games, with their toss fields. Only FINAL games are ever drawn (the same rule as a result). */
async function recent(gameId?: string): Promise<MatchDoc[]> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'matches',
    where: gameId ? { and: [{ status: { equals: 'FINAL' } }, { gameId: { equals: gameId } }] } : { status: { equals: 'FINAL' } },
    sort: ['-localDate', '-id'], limit: gameId ? 1 : RECENT, depth: 0, pagination: false, overrideAccess: true, select: FIELDS,
  })
  return docs
}

/** Games whose toss is known. A game with no toss data is not offered. */
export async function tossChoices(): Promise<SourceList> {
  const [docs, labels, club] = await Promise.all([recent(), getLabelMap(), clubNames()])
  const choices = docs.flatMap((m) => {
    const d = toData(m, club.name, labels)
    return d ? [{ id: String(m.gameId), label: `${[d.grade, d.round].filter(Boolean).join(' ')} v ${d.opponent}, ${d.dateLabel}` }] : []
  })
  return { choices: choices.slice(0, 12), empty: 'No game has toss details yet.' }
}

export async function loadToss(p: TossParams): Promise<TossData | null> {
  const [docs, labels, club] = await Promise.all([recent(p.gameId), getLabelMap(), clubNames()])
  return docs[0] ? toData(docs[0], club.name, labels) : null
}
