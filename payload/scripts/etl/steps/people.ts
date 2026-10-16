import { sectionOf } from '../../../../lib/people'
import { importFile } from '../media'
import { bumpSequence, existingById, upsertRow } from '../rows'
import type { EtlStep } from './types'

type Row = {
  id: number
  role: string
  name: string
  phone: string
  email: string
  photo_url: string
  section: string
  sort_order: number
  created_at: Date
}

/** Step 6: `people` ← `committee_contacts` (id kept). `photo` → media; unknown `section` → committee. */
export const peopleStep: EtlStep = {
  name: 'people',
  async run(ctx) {
    const { payload, source, report, dryRun, update } = ctx
    const counts = report.counts('people')
    const rows = await source.rows<Row>('committee_contacts')
    counts.read = rows.length
    for (const r of rows) {
      const section = sectionOf(r.section)
      if (section !== r.section) {
        report.add({ step: 'people', table: 'committee_contacts', id: r.id, field: 'section', kind: 'coerced', detail: `"${r.section}" → "${section}"` })
      }
      if (!dryRun && !update && (await existingById(payload, 'people', r.id))) {
        counts.skipped++
        continue
      }
      const photo = await importFile(ctx, {
        collection: 'media',
        url: r.photo_url,
        data: { alt: '' },
        relation: true,
        where: { step: 'people', table: 'committee_contacts', id: r.id, field: 'photo_url' },
      })
      // Strings verbatim (the trim hook is skipped under context.etl).
      await upsertRow(ctx, {
        step: 'people',
        collection: 'people',
        id: r.id,
        data: { name: r.name, role: r.role, section, phone: r.phone ?? '', email: r.email ?? '', photo: photo.id, sortOrder: r.sort_order ?? 0 },
        createdAt: r.created_at,
      })
    }
    if (!dryRun) await bumpSequence(payload, 'people', await source.sequenceLastValue('committee_contacts'))
  },
}
