import { fullName } from '../../../hooks/displayName'
import { ETL_CONTEXT, importFile } from '../media'
import { bumpSequence, existingById, restoreTimestamps } from '../rows'
import type { EtlStep } from './types'

type Row = {
  id: number
  slug: string
  first_name: string
  last_name: string
  photo_url: string | null
  bio: string | null
  source: string
  manual_years: string | null
  active_override: string | null
  is_active_derived: boolean
  hidden: boolean
  created_at: Date
  updated_at: Date | null
}

type Honour = { id: number; player_id: number; years: string; title: string; sort_order: number }

/**
 * Step 12: `players` (id kept; spec §12.2), with `honours` from `player_honours` ordered by
 * `sort_order, id` (the legacy page order) and `photo` as media. `slug`, `source`,
 * `displayName` (derived, as the hook would) and `isActiveDerived` are kept — every players
 * hook keeps supplied values under `context.etl`. Timestamps are restored.
 */
export const playersStep: EtlStep = {
  name: 'players',
  async run(ctx) {
    const { payload, source, report, dryRun, update } = ctx
    const counts = report.counts('players')
    const rows = await source.rows<Row>('players')
    const honours = await source.rows<Honour>('player_honours', 'player_id, sort_order, id')
    const honoursOf = new Map<number, Honour[]>()
    for (const h of honours) honoursOf.set(h.player_id, [...(honoursOf.get(h.player_id) ?? []), h])
    counts.read = rows.length
    for (const r of rows) {
      const where = { step: 'players', table: 'players', id: r.id }
      if (r.source !== 'playhq' && r.source !== 'manual') {
        report.add({ ...where, field: 'source', kind: 'skipped', detail: `unknown source "${r.source}"` })
        counts.skipped++
        continue
      }
      const existing = dryRun ? null : await existingById(payload, 'players', r.id)
      if (existing && !update) {
        counts.skipped++
        continue
      }
      const photo = await importFile(ctx, { collection: 'media', url: r.photo_url, data: { alt: '' }, relation: true, where: { ...where, field: 'photo_url' } })
      if (dryRun) {
        counts.planned++
        continue
      }
      const override: 'active' | 'past' | null = r.active_override === 'active' || r.active_override === 'past' ? r.active_override : null
      if (r.active_override && !override) {
        report.add({ ...where, field: 'active_override', kind: 'coerced', detail: `"${r.active_override}" → auto` })
      }
      const data = {
        slug: r.slug,
        firstName: r.first_name,
        lastName: r.last_name,
        displayName: fullName(r.first_name, r.last_name),
        photo: photo.id,
        bio: r.bio ?? '',
        source: r.source as 'playhq' | 'manual',
        manualYears: r.manual_years ?? '',
        activeOverride: override,
        isActiveDerived: Boolean(r.is_active_derived),
        hidden: Boolean(r.hidden),
        honours: (honoursOf.get(r.id) ?? []).map((h) => ({ years: h.years ?? '', title: h.title ?? '' })),
      }
      try {
        if (existing) {
          await payload.update({ collection: 'players', id: r.id, data, overrideAccess: true, depth: 0, context: { ...ETL_CONTEXT } })
          counts.updated++
        } else {
          await payload.create({ collection: 'players', data: { ...data, id: r.id } as never, overrideAccess: true, depth: 0, context: { ...ETL_CONTEXT } })
          counts.created++
        }
      } catch (err) {
        report.add({ ...where, kind: 'error', detail: (err as Error).message })
        counts.skipped++
        continue
      }
      await restoreTimestamps(payload, 'players', r.id, r.created_at, r.updated_at ?? r.created_at)
    }
    if (!dryRun) await bumpSequence(payload, 'players', await source.sequenceLastValue('players'))
  },
}
