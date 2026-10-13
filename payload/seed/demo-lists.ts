import type { Payload } from 'payload'
import sharp from 'sharp'

const CTX = { disableRevalidate: true } as const

/** Neutral abstract tiles (a head-and-shoulders silhouette or soft shapes): no photographs, no real people, made in code. Hex colours are deliberate demo artwork (the brand-hex guard skips payload/seed). */
const PALETTE = [
  ['#1f4e79', '#e8eef5'],
  ['#2f6b3a', '#e6f1e8'],
  ['#7a3b1d', '#f6e7dc'],
  ['#5b2d82', '#eee6f5'],
  ['#8a6d1a', '#f7efd6'],
  ['#8a2d3b', '#f6e1e5'],
] as const

/** A plain head-and-shoulders silhouette (or, for wide tiles, soft shapes) on a strong colour: readable as a thumbnail, no text, nobody real. */
const tileSvg = (i: number, w: number, h: number) => {
  const [a, b] = PALETTE[i % PALETTE.length]
  const wide = w > h
  const art = wide
    ? `<circle cx="${w * 0.78}" cy="${h * 0.3}" r="${h * 0.38}" fill="${b}" opacity="0.35"/><circle cx="${w * 0.2}" cy="${h * 0.95}" r="${h * 0.5}" fill="${b}" opacity="0.25"/><rect x="${w * 0.1}" y="${h * 0.3}" width="${w * 0.4}" height="${h * 0.08}" rx="${h * 0.04}" fill="${b}"/><rect x="${w * 0.1}" y="${h * 0.45}" width="${w * 0.28}" height="${h * 0.08}" rx="${h * 0.04}" fill="${b}" opacity="0.7"/>`
    : `<circle cx="${w / 2}" cy="${h * 0.36}" r="${w * 0.19}" fill="${b}"/><ellipse cx="${w / 2}" cy="${h * 0.9}" rx="${w * 0.36}" ry="${h * 0.3}" fill="${b}"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${a}"/>${art}</svg>`
}

async function tileMedia(payload: Payload, name: string, i: number, w = 800, h = 800): Promise<number> {
  const data = await sharp(Buffer.from(tileSvg(i, w, h))).png().toBuffer()
  const file = `demo-tile-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`
  const found = await payload.find({ collection: 'media', where: { filename: { equals: file } }, limit: 1, depth: 0, overrideAccess: true })
  if (found.docs[0]) {
    await payload.update({ collection: 'media', id: found.docs[0].id, data: {}, file: { data, mimetype: 'image/png', name: file, size: data.length }, overrideAccess: true, context: CTX })
    return found.docs[0].id as number
  }
  const m = await payload.create({ collection: 'media', data: { alt: `${name} (sample picture)` }, file: { data, mimetype: 'image/png', name: file, size: data.length }, overrideAccess: true, context: CTX })
  return m.id as number
}

/**
 * Demo data for the redesigned lists and forms (wave G WP-4), so every status pill and every picture column can be seen.
 * Idempotent: it only adds what is missing (counts, not names, because the demo players are invented by other seeds).
 * - Pictures (generated tiles) for up to 8 players, 3 contacts and 2 events.
 * - One hidden player and one "Past player" (a "Show as" choice), so the Players list shows Playing now, Past player and Hidden.
 */
export async function seedDemoLists(payload: Payload): Promise<string> {
  const notes: string[] = []

  const withPhoto = await payload.count({ collection: 'players', where: { photo: { exists: true } }, overrideAccess: true })
  const need = Math.max(0, 8 - withPhoto.totalDocs)
  if (need > 0) {
    const players = await payload.find({ collection: 'players', where: { and: [{ photo: { exists: false } }, { hidden: { equals: false } }] }, sort: 'displayName', limit: need + 2, depth: 0, overrideAccess: true })
    const docs = players.docs.slice(0, need)
    for (const [i, p] of docs.entries()) {
      await payload.update({ collection: 'players', id: p.id, data: { photo: await tileMedia(payload, String(p.displayName ?? p.firstName), i) }, overrideAccess: true, context: CTX })
    }
    if (docs.length) notes.push(`${docs.length} player pictures`)
  }

  const hidden = await payload.count({ collection: 'players', where: { hidden: { equals: true } }, overrideAccess: true })
  if (hidden.totalDocs === 0) {
    const pick = await payload.find({ collection: 'players', where: { and: [{ photo: { exists: false } }, { source: { equals: 'manual' } }] }, sort: '-displayName', limit: 1, depth: 0, overrideAccess: true })
    if (pick.docs[0]) {
      await payload.update({ collection: 'players', id: pick.docs[0].id, data: { hidden: true }, overrideAccess: true, context: CTX })
      notes.push('a hidden player')
    }
  }
  const past = await payload.count({ collection: 'players', where: { activeOverride: { equals: 'past' } }, overrideAccess: true })
  if (past.totalDocs === 0) {
    const pick = await payload.find({ collection: 'players', where: { and: [{ hidden: { equals: false } }, { activeOverride: { not_equals: 'past' } }] }, sort: '-displayName', limit: 1, page: 2, depth: 0, overrideAccess: true })
    const target = pick.docs[0]
    if (target) {
      await payload.update({ collection: 'players', id: target.id, data: { activeOverride: 'past' }, overrideAccess: true, context: CTX })
      notes.push('a past player')
    }
  }

  const peopleWith = await payload.count({ collection: 'people', where: { photo: { exists: true } }, overrideAccess: true })
  const people = await payload.find({ collection: 'people', where: { photo: { exists: false } }, sort: 'sortOrder', limit: Math.max(0, 3 - peopleWith.totalDocs), depth: 0, overrideAccess: true })
  for (const [i, p] of people.docs.entries()) {
    await payload.update({ collection: 'people', id: p.id, data: { photo: await tileMedia(payload, String(p.name), i + 2) }, overrideAccess: true, context: CTX })
  }
  if (people.docs.length) notes.push(`${people.docs.length} contact pictures`)

  const eventsWith = await payload.count({ collection: 'events', where: { cover: { exists: true } }, overrideAccess: true })
  const events = await payload.find({ collection: 'events', where: { cover: { exists: false } }, limit: Math.max(0, 2 - eventsWith.totalDocs), depth: 0, overrideAccess: true })
  for (const [i, e] of events.docs.entries()) {
    await payload.update({ collection: 'events', id: e.id, data: { cover: await tileMedia(payload, String(e.title), i + 1, 1200, 675) }, overrideAccess: true, context: CTX })
  }
  if (events.docs.length) notes.push(`${events.docs.length} event pictures`)

  return notes.length ? `added ${notes.join(', ')}` : 'already present, skipped'
}
