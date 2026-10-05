import type { Payload } from 'payload'
import { CLUB_COUNTRY } from '../../config/site'
import { linkToken } from '../../lib/availability-link'
import { wallClockToUtc } from '../../lib/selection/fixtures-plan'
import { currentSeasonStartYear } from '../../lib/selection/season'
import { getSelectionSettings } from '../../lib/selection/store'
import { normalisePhone, lastFour } from '../../lib/selection/phone'
import { hashPin } from '../../lib/selection/pin'

/**
 * Demo data for availability and squads (announce-teams spec 4.10). Invented players (nobody real), two grades, the next three
 * Saturdays, squads for the current season built the way "Start from last season" would, last-season rows so that button has
 * something to show, obviously fake phone numbers, a few availability answers and the player link printed to the log.
 * Idempotent: skipped once any selection fixture exists. Local demo data only.
 */
const CTX = { disableRevalidate: true } as const
const FIRST = ['Jordan', 'Casey', 'Riley', 'Morgan', 'Taylor', 'Jamie', 'Drew', 'Cameron', 'Quinn', 'Avery', 'Blake', 'Reese']
const LAST = ['Ashdown', 'Brennan', 'Calloway', 'Dunmore', 'Everett', 'Fairley', 'Garrick', 'Holloway', 'Ingram', 'Jessop', 'Kendrick', 'Lockhart', 'Maddison', 'Norwood', 'Oakley', 'Pemberton', 'Quill', 'Redfern', 'Stanhope', 'Thackeray', 'Underhill', 'Vance', 'Whitcombe', 'Yardley', 'Zeller']
const OPPONENTS = ['Riverbend', 'Hillcrest', 'Creekside']
const GRADES = [
  { id: 'demo-grade-a', name: 'A Grade' },
  { id: 'demo-grade-b', name: 'B Grade' },
] as const

/** An obviously fake number in the configured country's format: `0400 000 0NN` for the default Australian locale. */
export const demoPhone = (n: number): string => (CLUB_COUNTRY === 'AU' || !CLUB_COUNTRY ? `0400 000 0${String(n).padStart(2, '0')}` : `555 010 ${String(1000 + n)}`)

const nextSaturdays = (count: number, from: Date = new Date()): string[] => {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()))
  d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7 || 7))
  return Array.from({ length: count }, (_, i) => new Date(d.getTime() + i * 7 * 86_400_000).toISOString().slice(0, 10))
}

export async function seedDemoSelection(payload: Payload, selectorEmail = 'sam.selector@example.com'): Promise<void> {
  const existing = await payload.count({ collection: 'selection-fixtures', overrideAccess: true })
  if (existing.totalDocs > 0) {
    console.log('[seed-demo] selection: already present, skipped')
    return
  }
  const year = currentSeasonStartYear()
  const lastSeason = `${year - 1}/${String(year).slice(2)}`
  const thisSeason = `${year}/${String(year + 1).slice(2)}`
  const club = 'Lang Lang'

  const players: { id: number; name: string }[] = []
  for (let i = 0; i < 28; i++) {
    const firstName = FIRST[i % FIRST.length]
    const lastName = LAST[i % LAST.length]
    const p = await payload.create({ collection: 'players', data: { firstName, lastName, bio: '' }, overrideAccess: true, context: CTX })
    players.push({ id: p.id, name: `${firstName} ${lastName}` })
  }

  const saturdays = nextSaturdays(3)
  for (const g of GRADES) {
    for (const [i, date] of saturdays.entries()) {
      await payload.create({
        collection: 'selection-fixtures',
        data: {
          gameId: `demo-${g.id}-${i + 1}`,
          gradeId: g.id,
          gradeName: g.name,
          clubTeamId: `demo-team-${g.id}`,
          clubTeamName: `${club} ${g.name}`,
          roundName: `Round ${i + 5}`,
          localDate: date,
          localTime: g.id === 'demo-grade-a' ? '13:00:00' : '12:30:00',
          startsAt: wallClockToUtc(date, g.id === 'demo-grade-a' ? '13:00:00' : '12:30:00'),
          venueName: i % 2 === 0 ? `${club} Recreation Reserve` : `${OPPONENTS[i]} Oval`,
          opponentName: `${OPPONENTS[(i + (g.id === 'demo-grade-a' ? 0 : 1)) % OPPONENTS.length]} CC`,
          isHome: i % 2 === 0,
          status: 'upcoming',
          syncedAt: new Date().toISOString(),
        } as never,
        overrideAccess: true,
        context: CTX,
      })
    }
  }
  const fixtures = (await payload.find({ collection: 'selection-fixtures', overrideAccess: true, pagination: false, depth: 0, sort: 'localDate' })).docs

  // Squads: A Grade the first 13 players, B Grade the next 12, two players in both (fill-ins). The last three players are in no squad.
  const squadIds: Record<string, number> = {}
  for (const g of GRADES) {
    const s = await payload.create({ collection: 'squads', data: { seasonStartYear: year, gradeId: g.id, gradeName: g.name }, overrideAccess: true, context: CTX })
    squadIds[g.id] = s.id
  }
  const inA = players.slice(0, 13)
  const inB = [...players.slice(13, 25), players[11], players[12]]
  for (const [gradeId, list] of [['demo-grade-a', inA], ['demo-grade-b', inB]] as const) {
    for (const p of list) await payload.create({ collection: 'squad-members', data: { squad: squadIds[gradeId], player: p.id }, overrideAccess: true, context: CTX })
  }

  // Season rows: last season for everyone (the three unsquadded players too, so "Start from last season" has something to preview),
  // this season for some.
  const rows: { player: number; season: string; order: number; grade: string; games: number }[] = []
  for (const [i, p] of players.entries()) {
    const grade = i < 13 ? 'A Grade' : 'B Grade'
    rows.push({ player: p.id, season: lastSeason, order: 1, grade, games: 6 + (i % 9) })
    if (i < 8 || (i >= 13 && i < 20)) rows.push({ player: p.id, season: thisSeason, order: 0, grade, games: 1 + (i % 4) })
  }
  for (const r of rows) {
    await payload.create({
      collection: 'player-seasons',
      data: { player: r.player, seasonName: r.season, seasonOrder: r.order, teamId: `demo-${r.grade}-${r.season}`, teamName: `${club} ${r.grade}`, gradeName: r.grade, games: r.games, source: 'import', seasonStartYear: r.order === 0 ? year : year - 1 } as never,
      overrideAccess: true,
      context: CTX,
    })
  }

  // Phones (obviously fake) and one player with no phone and a manual PIN.
  const selector = (await payload.find({ collection: 'users', where: { email: { equals: selectorEmail } }, overrideAccess: true, limit: 1 })).docs[0]
  if (!selector) throw new Error('[seed-demo] selection: the demo selector must exist first')
  const asSelector = selector as never
  const noPhone = players[4]
  const profile = async (playerId: number, data: Record<string, unknown>) => {
    const found = await payload.find({ collection: 'player-selection-profiles', where: { player: { equals: playerId } }, overrideAccess: true, limit: 1, depth: 0 })
    if (found.docs[0]) await payload.update({ collection: 'player-selection-profiles', id: found.docs[0].id, data: data as never, overrideAccess: true, context: CTX })
    else await payload.create({ collection: 'player-selection-profiles', data: { player: playerId, ...data } as never, overrideAccess: true, context: CTX })
  }
  for (const [i, p] of players.entries()) {
    if (p.id === noPhone.id || i >= 25) continue
    const phone = normalisePhone(demoPhone(i + 1))
    if (!phone) continue
    const { hash, salt } = await hashPin(lastFour(phone)!)
    await profile(p.id, { phone, pinHash: hash, pinSalt: salt, pinSource: 'phone', pinSetAt: new Date().toISOString(), ...(i === 0 || i === 13 ? { role: 'keeper', canKeep: true } : {}) })
  }
  const manual = await hashPin('123456')
  await profile(noPhone.id, { pinHash: manual.hash, pinSalt: manual.salt, pinSource: 'manual', pinSetAt: new Date().toISOString() })

  // A few answers: the first fixture of each grade is mostly answered, the others less so; some players have not replied.
  const answers = ['in', 'in', 'maybe', 'out', 'in'] as const
  for (const f of fixtures) {
    const squad = f.gradeId === 'demo-grade-a' ? inA : inB
    const nth = fixtures.filter((x) => x.gradeId === f.gradeId).indexOf(f)
    for (const [i, p] of squad.entries()) {
      if (i % (nth + 2) === 0) continue // no reply
      await payload.create({ collection: 'availability', data: { player: p.id, fixture: f.id, status: answers[(i + nth) % answers.length], note: i === 3 && nth === 0 ? 'Can only play if I can bat early' : null } as never, overrideAccess: true, context: CTX, user: asSelector })
    }
  }

  const settings = await getSelectionSettings(payload)
  console.log(`[seed-demo] selection: ${players.length} invented players, 2 squads, ${fixtures.length} fixtures, availability and phones added`)
  console.log(`[seed-demo]   player link: ${payload.config.serverURL}/availability/${linkToken(settings.linkVersion)}`)
  console.log(`[seed-demo]   try ${players[0].name} with PIN ${demoPhone(1).replace(/\D/g, '').slice(-4)} (the last four digits of the fake phone), or ${noPhone.name} with PIN 123456`)
}
