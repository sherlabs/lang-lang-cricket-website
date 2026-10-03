import { bumpSequence, upsertRow } from '../rows'
import type { EtlStep } from './types'

type Row = { id: number; title: string; body: string; published: boolean; created_at: Date; updated_at: Date }

/** Step 7: `announcements` (id kept — the `llcc_ann_dismissed` cookie stores it). */
export const announcementsStep: EtlStep = {
  name: 'announcements',
  async run(ctx) {
    const { payload, source, report, dryRun } = ctx
    const counts = report.counts('announcements')
    const rows = await source.rows<Row>('announcements')
    counts.read = rows.length
    for (const r of rows) {
      await upsertRow(ctx, {
        step: 'announcements',
        collection: 'announcements',
        id: r.id,
        data: { title: r.title, body: r.body ?? '', published: Boolean(r.published) },
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })
    }
    if (!dryRun) await bumpSequence(payload, 'announcements', await source.sequenceLastValue('announcements'))
  },
}
