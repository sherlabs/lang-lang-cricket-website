import { sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'
import { resetPlayers } from './players-helpers'

const CTX = { disableRevalidate: true } as const

/** Empties everything the selection work package writes (the players truncate cascades into most of it; the rest is explicit). */
export async function resetSelection(payload: Payload): Promise<void> {
  await resetPlayers(payload)
  await payload.db.drizzle.execute(
    sql.raw('TRUNCATE "payload"."availability", "payload"."squad_members", "payload"."squads", "payload"."selection_fixtures", "payload"."player_selection_profiles", "payload"."throttle_hits" RESTART IDENTITY CASCADE'),
  )
  await payload.db.drizzle.execute(sql.raw('DELETE FROM "payload"."selection_settings"'))
}

export async function makePlayer(payload: Payload, firstName: string, lastName: string, extra: Record<string, unknown> = {}) {
  return payload.create({ collection: 'players', data: { firstName, lastName, ...extra } as never, overrideAccess: true, context: CTX })
}

export function isoDate(daysFromNow: number): string {
  return new Date(Date.now() + daysFromNow * 86_400_000).toISOString().slice(0, 10)
}

export async function makeFixture(payload: Payload, over: Record<string, unknown> = {}) {
  const n = Math.floor(Math.random() * 1e9)
  return payload.create({
    collection: 'selection-fixtures',
    data: {
      gameId: `game-${n}`,
      gradeId: 'grade-b',
      gradeName: 'B Grade',
      clubTeamId: 'team-b',
      clubTeamName: 'Test Club B Grade',
      roundName: 'Round 5',
      localDate: isoDate(5),
      localTime: '13:00:00',
      startsAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      venueName: 'Home Oval',
      opponentName: 'Example Rovers',
      isHome: true,
      status: 'upcoming',
      ...over,
    } as never,
    overrideAccess: true,
    context: CTX,
  })
}

export async function makeSquad(payload: Payload, year: number, gradeId = 'grade-b', gradeName = 'B Grade') {
  return payload.create({ collection: 'squads', data: { seasonStartYear: year, gradeId, gradeName }, overrideAccess: true, context: CTX })
}

export async function addToSquad(payload: Payload, squadId: number, playerId: number) {
  return payload.create({ collection: 'squad-members', data: { squad: squadId, player: playerId } as never, overrideAccess: true, context: CTX })
}
