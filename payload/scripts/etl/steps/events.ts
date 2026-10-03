import { importFile } from '../media'
import { bumpSequence, existingById, upsertRow } from '../rows'
import type { EtlStep } from './types'

type Row = {
  id: number
  type: string
  title: string
  description: string
  location: string
  cover_image_url: string
  payment_link_label: string
  payment_link_url: string
  meal_options: unknown
  event_time: string
  event_date: Date | null
  day_of_week: number | null
  start_date: Date | null
  end_date: Date | null
  created_at: Date
}

const iso = (d: Date | null) => (d instanceof Date ? d.toISOString() : null)

/**
 * Step 8: `events` (id kept). `coverImageUrl` → media; `mealOptions[]` → `[{ label }]`
 * verbatim (duplicates included; the normalising hook is skipped under context.etl);
 * `dayOfWeek` → string; dates are already UTC midnight and are copied as-is (the eventDates
 * hook is skipped entirely). Legacy events have no `updated_at`: it is set to `created_at`.
 */
export const eventsStep: EtlStep = {
  name: 'events',
  async run(ctx) {
    const { payload, source, report, dryRun, update } = ctx
    const counts = report.counts('events')
    const rows = await source.rows<Row>('events')
    counts.read = rows.length
    for (const r of rows) {
      if (r.type !== 'one_time' && r.type !== 'recurring') {
        report.add({ step: 'events', table: 'events', id: r.id, field: 'type', kind: 'skipped', detail: `unknown type "${r.type}"` })
        counts.skipped++
        continue
      }
      if (!dryRun && !update && (await existingById(payload, 'events', r.id))) {
        counts.skipped++
        continue
      }
      const cover = await importFile(ctx, {
        collection: 'media',
        url: r.cover_image_url,
        data: { alt: '' },
        relation: true,
        where: { step: 'events', table: 'events', id: r.id, field: 'cover_image_url' },
      })
      const meals = Array.isArray(r.meal_options) ? r.meal_options.filter((m): m is string => typeof m === 'string') : []
      await upsertRow(ctx, {
        step: 'events',
        collection: 'events',
        id: r.id,
        data: {
          type: r.type,
          title: r.title,
          description: r.description ?? '',
          location: r.location ?? '',
          cover: cover.id,
          paymentLinkLabel: r.payment_link_label ?? '',
          paymentLinkUrl: r.payment_link_url ?? '',
          mealOptions: meals.map((label) => ({ label })),
          eventTime: r.event_time ?? '',
          eventDate: iso(r.event_date),
          dayOfWeek: r.day_of_week == null ? null : String(r.day_of_week),
          startDate: iso(r.start_date),
          endDate: iso(r.end_date),
        },
        createdAt: r.created_at,
      })
    }
    if (!dryRun) await bumpSequence(payload, 'events', await source.sequenceLastValue('events'))
  },
}
