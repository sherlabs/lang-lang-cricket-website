import { bumpSequence, importableParentIds, upsertRow } from '../rows'
import { importedEventIds, RSVP_RESPONSES } from '../rules'
import type { EtlStep } from './types'

type Row = {
  id: number
  event_id: number
  occurrence_date: Date
  name: string
  email: string
  note: string
  response: string
  meal: string
  edit_token: string
  created_at: Date
}

/**
 * Step 9: `event-rsvps` (id kept). `editToken` and `occurrenceDate` are copied exactly —
 * device cookies key on `<eventId>:<occurrenceDate.toISOString()>` → token. Orphans (no such
 * legacy event, or one the events step skipped) are skipped and reported; they stay in `public.*`.
 */
export const eventRsvpsStep: EtlStep = {
  name: 'event-rsvps',
  async run(ctx) {
    const { payload, source, report, dryRun } = ctx
    const counts = report.counts('event-rsvps')
    const events = await importableParentIds(ctx, 'events', importedEventIds(await source.rows('events')))
    const rows = await source.rows<Row>('event_rsvps')
    counts.read = rows.length
    for (const r of rows) {
      const where = { step: 'event-rsvps', table: 'event_rsvps', id: r.id }
      if (!events.has(r.event_id)) {
        report.add({ ...where, field: 'event_id', kind: 'orphan-skipped', detail: `event ${r.event_id} does not exist or was not imported` })
        counts.skipped++
        continue
      }
      if (!RSVP_RESPONSES.has(r.response)) {
        report.add({ ...where, field: 'response', kind: 'skipped', detail: `unknown response "${r.response}"` })
        counts.skipped++
        continue
      }
      await upsertRow(ctx, {
        step: 'event-rsvps',
        collection: 'event-rsvps',
        id: r.id,
        data: {
          event: r.event_id,
          occurrenceDate: r.occurrence_date.toISOString(),
          name: r.name,
          email: r.email ?? '',
          note: r.note ?? '',
          response: r.response as 'yes' | 'no',
          meal: r.meal ?? '',
          editToken: r.edit_token,
        },
        createdAt: r.created_at,
      })
    }
    if (!dryRun) await bumpSequence(payload, 'event-rsvps', await source.sequenceLastValue('event_rsvps'))
  },
}
