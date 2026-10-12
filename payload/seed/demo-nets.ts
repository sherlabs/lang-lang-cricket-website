import type { Payload } from 'payload'
import { NETS } from '../../lib/nets/constants'
import { buildRotation } from '../../lib/nets/rotation'
import { clubToday } from '../../lib/selection-fixtures'
import { addDays } from '../../lib/votes/status'

/**
 * Demo net sessions (wave B spec 4.8), on top of the demo squads: two finished sessions and one planned for today, check-ins for
 * about twelve players with a spread (one regular who is at every session, one who never comes, the rest in between), batting and
 * bowling styles and roles on the roster, and a committee-only note on one player. Idempotent: skipped once any session exists.
 * Local demo data only, invented players.
 */
const CTX = { disableRevalidate: true } as const
const BATTING = ['right-hand', 'right-hand', 'left-hand', 'right-hand'] as const
const BOWLING = ['right-arm medium', 'right-arm off-break', 'left-arm orthodox', 'right-arm fast', 'none', 'right-arm leg-break', 'left-arm medium', 'none', 'left-arm fast', 'right-arm medium'] as const
const ROLES = ['batter', 'bowler', 'all-rounder', 'batter', 'bowler', 'keeper'] as const

export async function seedDemoNets(payload: Payload): Promise<void> {
  const have = await payload.count({ collection: 'net-sessions', overrideAccess: true })
  if (have.totalDocs > 0) {
    console.log('[seed-demo] nets: already present, skipped')
    return
  }
  const squads = (await payload.find({ collection: 'squads', where: { gradeId: { like: 'demo-' } }, overrideAccess: true, pagination: false, depth: 0, sort: 'gradeId' })).docs
  const memberIds = (
    await Promise.all(
      squads.map(async (sq) => (await payload.find({ collection: 'squad-members', where: { squad: { equals: sq.id } }, overrideAccess: true, pagination: false, depth: 0, sort: 'id' })).docs.map((m) => (typeof m.player === 'object' ? (m.player as { id: number }).id : (m.player as number)))),
    )
  ).flat()
  const roster = [...new Set(memberIds)].slice(0, 14)
  if (roster.length < 8) {
    console.log('[seed-demo] nets: no demo squads to build on, skipped')
    return
  }
  const names = new Map<number, string>()
  for (const id of roster) {
    const p = await payload.findByID({ collection: 'players', id, depth: 0, overrideAccess: true })
    names.set(id, (p.displayName as string | undefined)?.trim() || `${p.firstName} ${p.lastName ?? ''}`.trim())
  }
  const selector = (await payload.find({ collection: 'users', where: { role: { equals: 'selector' } }, limit: 1, depth: 0, overrideAccess: true })).docs[0]

  // Roles, styles and one committee-only note. Only fills what is empty, so a hand-edited demo is left alone.
  for (const [i, id] of roster.entries()) {
    const existing = (await payload.find({ collection: 'player-selection-profiles', where: { player: { equals: id } }, limit: 1, depth: 0, overrideAccess: true })).docs[0] as { id: number; role?: string | null } | undefined
    const data: Record<string, unknown> = { battingStyle: BATTING[i % BATTING.length], bowlingStyle: BOWLING[i % BOWLING.length] }
    if (!existing?.role) data.role = ROLES[i % ROLES.length]
    if (i === 3) Object.assign(data, { notes: 'Carrying a sore shoulder; check before giving a long bowling spell. Committee only.', notesStaffOnly: true })
    if (existing) await payload.update({ collection: 'player-selection-profiles', id: existing.id, data: data as never, overrideAccess: true, context: CTX })
    else await payload.create({ collection: 'player-selection-profiles', data: { player: id, ...data } as never, overrideAccess: true, context: CTX })
  }

  const today = clubToday()
  const regular = roster[0]
  const never = roster[roster.length - 1]
  const make = async (daysAgo: number, title: string, going: number[], state: 'finished' | 'planned') => {
    const date = addDays(today, -daysAgo)
    const base = { title, date, startTime: '18:00', nets: NETS.defaults.nets, minutesPerTurn: NETS.defaults.minutesPerTurn, groupSize: NETS.defaults.groupSize, createdBy: selector?.id, revision: 1 }
    const people = going.map((id) => ({ key: `player:${id}`, name: names.get(id)! }))
    const plan = state === 'finished' ? buildRotation({ players: people, nets: base.nets, groupSize: base.groupSize }) : null
    const startedAt = new Date(`${date}T08:00:00Z`).toISOString()
    const session = await payload.create({
      collection: 'net-sessions',
      data: { ...base, state, round: 0, ...(plan ? { rotationPlan: plan, roundStartedAt: startedAt, finishedAt: new Date(`${date}T09:00:00Z`).toISOString(), revision: 4 } : {}) } as never,
      overrideAccess: true,
      context: CTX,
    })
    for (const id of going) {
      await payload.create({ collection: 'net-attendance', data: { session: session.id, playerKey: `player:${id}`, player: id, checkedInAt: new Date(`${date}T07:5${id % 10}:00Z`).toISOString(), checkedInBy: selector?.id } as never, overrideAccess: true, context: CTX })
    }
    if (state === 'finished') await payload.create({ collection: 'net-attendance', data: { session: session.id, playerKey: 'guest:visiting vic', guestName: 'Visiting Vic', checkedInAt: new Date(`${date}T08:00:00Z`).toISOString() } as never, overrideAccess: true, context: CTX })
  }
  const others = roster.slice(1, -1)
  await make(14, 'Tuesday nets', [regular, ...others.slice(0, 9)], 'finished')
  await make(7, 'Tuesday nets', [regular, ...others.slice(3, 11)], 'finished')
  await make(0, 'Tuesday nets', [regular, ...others.slice(0, 3)], 'planned')
  console.log(`[seed-demo] nets: 2 finished sessions and one planned for today, check-ins for ${roster.length - 1} players (${names.get(regular)} at every session, ${names.get(never)} never), styles and roles on ${roster.length} players, one committee-only note`)
  console.log('[seed-demo]   open /selector/nets, then a player card (for example ' + `${names.get(roster[3])}) as a selector and as an editor to see the committee note`)
}
