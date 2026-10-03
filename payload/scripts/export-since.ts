/**
 * Rollback aid (spec §13.4): print, as CSV, every row created or updated in Payload since a
 * point in time (the promote time of §13.2 step 9), so it can be re-entered by hand in the
 * legacy app after an Instant Rollback. Read-only.
 *
 *   pnpm payload run payload/scripts/export-since.ts -- --target <host>/<db> --since 2026-10-10T09:30:00Z
 *        [--collections event-rsvps,stories] [--out tmp/export-since.csv]
 *
 * One CSV with a `collection` column; scalar fields as-is, relations as ids, arrays/objects as
 * JSON (stories' Lexical content as plain text). Secrets (user hashes/salts) are never exported.
 */
import config from '@payload-config'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getPayload, type CollectionSlug } from 'payload'
import { storyPlainText, type StoryContent } from '../../lib/stories-convert'
import { argValue, guard } from './_guard'

/** Collections a visitor or an admin can write after cutover, in re-entry order. */
export const EXPORT_COLLECTIONS: CollectionSlug[] = [
  'announcements',
  'documents',
  'gallery-photos',
  'sponsors',
  'people',
  'events',
  'event-rsvps',
  'event-photos',
  'stories',
  'players',
  'media',
]

const SKIP_FIELDS = new Set(['hash', 'salt', 'sessions', 'resetPasswordToken', 'resetPasswordExpiration', 'loginAttempts', 'lockUntil', 'sizes'])

export function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: Record<string, unknown>[]): string {
  const cols: string[] = []
  for (const r of rows) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k)
  return [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n'
}

async function main() {
  const argv = process.argv
  await guard({ write: false })
  const sinceArg = argValue(argv, '--since')
  const since = sinceArg ? new Date(sinceArg) : null
  if (!since || Number.isNaN(since.getTime())) throw new Error('[export-since] pass --since <ISO timestamp>, e.g. 2026-10-10T09:30:00Z')
  const collections = (argValue(argv, '--collections')?.split(',').map((s) => s.trim()) ?? EXPORT_COLLECTIONS) as CollectionSlug[]
  // A file, not stdout: the guard and Payload's logger also write to stdout.
  const out = argValue(argv, '--out') ?? 'tmp/export-since.csv'

  const payload = await getPayload({ config })
  const rows: Record<string, unknown>[] = []
  try {
    for (const collection of collections) {
      const { docs } = await payload.find({
        collection,
        where: { or: [{ createdAt: { greater_than_equal: since.toISOString() } }, { updatedAt: { greater_than_equal: since.toISOString() } }] },
        pagination: false,
        depth: 0,
        overrideAccess: true,
        sort: 'id',
        ...(collection === 'events' || collection === 'players' ? { joins: false } : {}),
      } as Parameters<typeof payload.find>[0])
      for (const doc of docs as unknown as Record<string, unknown>[]) {
        const row: Record<string, unknown> = { collection }
        for (const [k, v] of Object.entries(doc)) {
          if (SKIP_FIELDS.has(k)) continue
          row[k] = k === 'content' && collection === 'stories' ? storyPlainText(v as StoryContent) : v
        }
        rows.push(row)
      }
      console.log(`[export-since] ${collection}: ${docs.length} row(s)`)
    }
  } finally {
    await payload.destroy()
  }
  await mkdir(path.dirname(path.resolve(out)), { recursive: true })
  await writeFile(out, toCsv(rows))
  console.log(`[export-since] ${rows.length} row(s) written to ${out}`)
}

try {
  await main()
} catch (err) {
  console.error(err)
  process.exit(1)
}
