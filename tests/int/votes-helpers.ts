import type { Payload } from 'payload'
import { signAvailCookie } from '@/lib/availability-link'
import { clubToday } from '@/lib/selection-fixtures'
import { addDays } from '@/lib/votes/status'
import { makeFixture, makePlayer } from './selection-helpers'

const CTX = { disableRevalidate: true } as const

export const settingsPatch = async (payload: Payload, votes: Record<string, unknown>) => {
  await payload.updateGlobal({ slug: 'selection-settings', data: { votes } as never, overrideAccess: true, context: CTX })
}

export const votesOn = (payload: Payload, extra: Record<string, unknown> = {}) => settingsPatch(payload, { enabled: true, minBallotsToCount: 3, ...extra })

/** `n` players named Player 01..., none hidden. */
export async function makeTeam(payload: Payload, n: number, prefix = 'Player') {
  const out: { id: number; name: string }[] = []
  for (let i = 1; i <= n; i++) {
    const p = await makePlayer(payload, `${prefix}${String(i).padStart(2, '0')}`, 'Tester')
    out.push({ id: p.id, name: `${prefix}${String(i).padStart(2, '0')} Tester` })
  }
  return out
}

/** A finished game `daysAgo` days back, with a published team sheet naming `playerIds`. */
export async function makeFinalGame(payload: Payload, playerIds: readonly number[], o: { daysAgo?: number; over?: Record<string, unknown> } = {}) {
  const date = addDays(clubToday(), -(o.daysAgo ?? 1))
  const fixture = await makeFixture(payload, { status: 'final', localDate: date, startsAt: new Date(`${date}T03:00:00Z`).toISOString(), ...o.over })
  await payload.create({
    collection: 'team-sheets',
    data: {
      fixture: fixture.id,
      size: 0,
      publishedAt: new Date().toISOString(),
      publishedSnapshot: { revision: 1, publishedAt: new Date().toISOString(), size: 0, slots: playerIds.map((playerId, i) => ({ playerId, order: i + 1, isCaptain: false, isKeeper: false })) },
    } as never,
    overrideAccess: true,
    context: CTX,
  })
  return fixture
}

/** The cookie a remembered phone would carry. */
export const cookieFor = (playerId: number, linkVersion = 1, iat = Date.now()) => signAvailCookie({ playerId, linkVersion, iat })

export const ballotCount = async (payload: Payload, fixtureId?: number): Promise<number> =>
  (await payload.count({ collection: 'best-player-ballots', where: fixtureId ? { fixture: { equals: fixtureId } } : {}, overrideAccess: true })).totalDocs
