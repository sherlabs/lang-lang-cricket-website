import 'server-only'
import type { Person } from '@/lib/domain'
import type { LinkedPerson } from '@/lib/identity'
import { resolvePhotoUrl } from '@/lib/identity'
import { getPayloadClient } from '@/lib/payload/client'
import { toPerson } from '@/lib/payload/mappers'

/**
 * The ONE read path for individuals (spec 2026-10-04-people-sponsors-apparel-design.md).
 * Home, /contact, /people and the player pages all come through here; nothing else reads the
 * `people` collection for display.
 */

/** People by `sortOrder`, optionally one section. */
export async function listPeople(section?: string): Promise<Person[]> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'people',
    ...(section ? { where: { section: { equals: section } } } : {}),
    sort: ['sortOrder', 'id'],
    pagination: false,
    depth: 2,
  })
  // Shared photo rule: the person's own picture, else the linked player's, else initials (Avatar).
  return docs.map(toPerson).map((p) => ({ ...p, photoUrl: resolvePhotoUrl(p.photoUrl, p.playerPhotoUrl) }))
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
      out.set(person.playerId, { id: person.id, name: person.name, role: person.role, section: person.section, photoUrl: person.photoUrl })
    }
  }
  return out
}
