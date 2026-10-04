import 'server-only'
import type { Person } from '@/lib/domain'
import type { LinkedPerson } from '@/lib/identity'
import { expandPeople, rolesOf } from '@/lib/people'
import { resolvePhotoUrl } from '@/lib/identity'
import { getPayloadClient } from '@/lib/payload/client'
import { toPerson } from '@/lib/payload/mappers'

/**
 * The ONE read path for individuals (spec 2026-10-04-people-sponsors-apparel-design.md).
 * Home, /contact, /people and the player pages all come through here; nothing else reads the
 * `people` collection for display.
 */

/**
 * People by `sortOrder`, optionally one section. One person = one record with many roles
 * (`moreRoles`): each person is expanded into one entry per role/section, all sharing the same
 * photo, phone and email, and a person appears at most once per section. With `section`, only
 * the entries in that section are returned (so a leadership + committee person shows in both).
 */
export async function listPeople(section?: string): Promise<Person[]> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'people',
    sort: ['sortOrder', 'id'],
    pagination: false,
    depth: 2,
  })
  // Shared photo rule: the person's own picture, else the linked player's, else initials (Avatar).
  const people = docs.map(toPerson).map((p) => ({ ...p, photoUrl: resolvePhotoUrl(p.photoUrl, p.playerPhotoUrl) }))
  const cards = expandPeople(people)
  return section ? cards.filter((p) => p.section === section) : cards
}

/**
 * The person linked to each of the given players, keyed by player id. When several people point
 * at one player the first by `sortOrder` then id wins. Used to apply the shared photo rule.
 */
export async function getLinkedPeople(playerIds: readonly number[]): Promise<Map<number, LinkedPerson>> {
  const out = new Map<number, LinkedPerson>()
  if (playerIds.length === 0) return out
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'people',
    where: { player: { in: [...playerIds] } },
    sort: ['sortOrder', 'id'],
    pagination: false,
    depth: 1,
  })
  // Own photo only here: the player's own photo is applied by the caller (identity.resolvePlayerIdentity).
  for (const person of docs.map(toPerson)) {
    if (person.playerId && !out.has(person.playerId)) {
      // The player page shows every job ("President, First Aid Officer"); the main one sets the section.
      const role = rolesOf(person, person.moreRoles).map((r) => r.role).join(', ') || person.role
      out.set(person.playerId, { id: person.id, name: person.name, role, section: person.section, photoUrl: person.photoUrl })
    }
  }
  return out
}
