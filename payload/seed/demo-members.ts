import type { Payload } from 'payload'

const CTX = { disableRevalidate: true } as const

type Spec = {
  firstName: string
  lastName: string
  roles: string[]
  email?: boolean
  phone?: boolean
  dateOfBirth?: string
  guardian?: number
  extra?: Record<string, unknown>
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '.')

/**
 * The demo club office members (wave D WP-1): about 40 people so the directory, the filters and the completeness strip have something
 * real to show. The mix is fixed on purpose: 6 with no email, 9 with no phone, 3 with neither, and 4 juniors that each have a
 * guardian. Invented names, `example.org` addresses and made-up numbers only. Idempotent: written only while `members` is empty.
 * The first up-to-12 demo players are also linked as members, so the link between a member and a player can be seen.
 */
export async function seedDemoMembers(payload: Payload): Promise<number> {
  if ((await payload.count({ collection: 'members', overrideAccess: true })).totalDocs > 0) return 0

  // Parents first: the juniors point at them (by position in this list).
  const parents: Spec[] = [
    { firstName: 'Morgan', lastName: 'Ellis', roles: ['parent'] },
    { firstName: 'Jordan', lastName: 'Whitfield', roles: ['parent', 'volunteer'] },
    { firstName: 'Casey', lastName: 'Okafor', roles: ['parent'] },
    { firstName: 'Riley', lastName: 'Brandt', roles: ['parent', 'committee'] },
  ]
  // Contact mix by position: 0-2 neither, 3-5 phone only, 6-11 email only, the rest complete.
  const people: Spec[] = [
    { firstName: 'Ollie', lastName: 'Ellis', roles: ['player'], dateOfBirth: '2014-03-09T12:00:00.000Z', guardian: 0 },
    { firstName: 'Mia', lastName: 'Whitfield', roles: ['player'], dateOfBirth: '2013-08-21T12:00:00.000Z', guardian: 1 },
    { firstName: 'Tom', lastName: 'Fairweather', roles: ['player'] },
    { firstName: 'Isla', lastName: 'Okafor', roles: ['player'], dateOfBirth: '2015-01-30T12:00:00.000Z', guardian: 2 },
    { firstName: 'Noah', lastName: 'Brandt', roles: ['player'], dateOfBirth: '2012-11-02T12:00:00.000Z', guardian: 3 },
    { firstName: 'Priya', lastName: 'Menon', roles: ['player'] },
    { firstName: 'Sam', lastName: 'Kowalski', roles: ['volunteer'] },
    { firstName: 'Dana', lastName: 'Reyes', roles: ['volunteer'] },
    { firstName: 'Lee', lastName: 'Hartigan', roles: ['sponsor-contact'] },
    { firstName: 'Alex', lastName: 'Nguyen', roles: ['volunteer', 'coach'] },
    { firstName: 'Bree', lastName: 'Castellan', roles: ['supporter'] },
    { firstName: 'Fred', lastName: 'Pomeroy', roles: ['supporter'] },
    { firstName: 'Harriet', lastName: 'Lowe', roles: ['life-member'], extra: { lifeMemberSince: 1998, membershipSince: '1985-07-01T12:00:00.000Z' } },
    { firstName: 'Graham', lastName: 'Lowe', roles: ['life-member', 'committee'], extra: { lifeMemberSince: 2005 } },
    { firstName: 'Patricia', lastName: 'Dunn', roles: ['committee', 'volunteer'] },
    { firstName: 'Wei', lastName: 'Zhang', roles: ['committee'] },
    { firstName: 'Angus', lastName: 'MacRae', roles: ['coach'] },
    { firstName: 'Tess', lastName: 'Bellamy', roles: ['coach', 'volunteer'] },
    { firstName: 'Omar', lastName: 'Haddad', roles: ['player'] },
    { firstName: 'Lucy', lastName: 'Vandenberg', roles: ['player'] },
    { firstName: 'Kerry', lastName: 'Sutton', roles: ['volunteer'] },
    { firstName: 'Ravi', lastName: 'Chandra', roles: ['sponsor-contact'] },
    { firstName: 'Maeve', lastName: 'Gallagher', roles: ['supporter', 'volunteer'] },
    { firstName: 'Doug', lastName: 'Tremaine', roles: ['supporter'] },
  ]

  const contact = (s: Spec, index: number) => {
    const key = `${slug(s.firstName)}.${slug(s.lastName)}`
    const noEmail = index >= 0 && index <= 5
    const noPhone = (index >= 0 && index <= 2) || (index >= 6 && index <= 11)
    const phone = `04${String(10 + (index % 80)).padStart(2, '0')} ${String(100 + index).padStart(3, '0')} ${String(200 + index).padStart(3, '0')}`
    return { email: noEmail ? null : `${key}@example.org`, phone: noPhone ? null : phone }
  }

  let created = 0
  const parentIds: number[] = []
  for (const [i, s] of parents.entries()) {
    const doc = await payload.create({ collection: 'members', data: { firstName: s.firstName, lastName: s.lastName, roles: s.roles as never, email: `${slug(s.firstName)}.${slug(s.lastName)}@example.org`, phone: `0412 000 ${String(10 + i).padStart(3, '0')}`, locality: 'Sampleville', region: 'Demo Region', postalCode: '0000', importedFrom: 'manual' } as never, overrideAccess: true, context: CTX, depth: 0 })
    parentIds.push(doc.id)
    created++
  }
  for (const [i, s] of people.entries()) {
    const c = contact(s, i)
    await payload.create({
      collection: 'members',
      data: {
        firstName: s.firstName,
        lastName: s.lastName,
        roles: s.roles as never,
        ...c,
        ...(s.dateOfBirth ? { dateOfBirth: s.dateOfBirth } : {}),
        ...(s.guardian !== undefined ? { guardians: [parentIds[s.guardian]], emergencyContact: { name: `${parents[s.guardian].firstName} ${parents[s.guardian].lastName}`, phone: '0412 000 099', relationship: 'Parent' } } : {}),
        ...(i % 5 === 0 ? { locality: 'Sampleville', region: 'Demo Region', postalCode: '0000' } : {}),
        ...(s.extra ?? {}),
        importedFrom: 'manual',
      } as never,
      overrideAccess: true,
      context: CTX,
      depth: 0,
    })
    created++
  }

  // Link up to 12 demo players: no typed name, full contact, so the player link is visible in the directory.
  const players = await payload.find({ collection: 'players', where: { hidden: { equals: false } }, sort: 'id', limit: 12, depth: 0, overrideAccess: true })
  for (const [i, p] of players.docs.entries()) {
    await payload.create({ collection: 'members', data: { player: p.id, roles: ['player'], email: `${slug(p.slug ?? `player-${p.id}`)}@example.org`, phone: `0421 000 ${String(100 + i).padStart(3, '0')}`, importedFrom: 'players' } as never, overrideAccess: true, context: CTX, depth: 0 }).catch(() => undefined)
    created++
  }
  return created
}
