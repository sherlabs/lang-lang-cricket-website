import type { UIFieldServerProps } from 'payload'
import { loadLabelSamples } from '@/lib/stats/label-queries'
import { buildLabelMap, canonicalGrade, canonicalTeam, type LabelKind } from '@/lib/stats/labels'
import { CATEGORY_LABELS, classifyGrade } from '@/lib/stats/categories'
import { getStatsSettings } from '@/lib/site-settings'

const KIND_LABEL: Record<LabelKind, string> = { grade: 'Grade', team: 'Team', opponent: 'Opposition' }

/**
 * Helper under the "Grade and team names" rows in Site settings (admins only; W2 spec 6.3): the grade and team names that
 * exist in the data right now, how many rows use each, what the site shows for it and which category that makes it, so the
 * admin picks from real names and sees what a rename does before saving. A grade's category can change with its name.
 */
export async function LabelRenamesHelp({ payload }: UIFieldServerProps) {
  let rows: { kind: LabelKind; label: string; count: number; shown: string; category: string }[] = []
  let failed = false
  try {
    const [samples, settings] = await Promise.all([loadLabelSamples(payload), getStatsSettings()])
    const map = buildLabelMap(samples, settings.labelRenames)
    rows = samples
      .map((s) => {
        const shown = s.kind === 'grade' ? canonicalGrade(s.label, map) : canonicalTeam(s.label, map)
        return { kind: s.kind, label: s.label, count: s.count, shown, category: s.kind === 'grade' ? CATEGORY_LABELS[classifyGrade(shown, null, settings.gradeRules)] : '' }
      })
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.shown.localeCompare(b.shown, undefined, { numeric: true }) || a.label.localeCompare(b.label))
  } catch {
    failed = true
  }
  return (
    <div className="club-field">
      <h3 className="club-field__title">Names in the data right now</h3>
      <p className="club-muted">
        Pick the name under &quot;From&quot; exactly as written here. Names that differ only in capital letters, spacing or a leading number (&quot;2. District&quot; and &quot;District&quot;) are already shown as one. Renaming a grade can change which category it counts as (shown on the right), so check the last column. Opposition names map to an opposition key, so leave those to a developer unless you know it.
      </p>
      {failed ? (
        <p className="club-muted">The list could not be loaded just now.</p>
      ) : rows.length === 0 ? (
        <p className="club-muted">Nothing is stored yet.</p>
      ) : (
        <table className="club-table">
          <thead>
            <tr><th>Kind</th><th>Name in the data</th><th>Rows</th><th>Shown on the site as</th><th>Counts as</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.kind}|${r.label}`}>
                <td>{KIND_LABEL[r.kind]}</td>
                <td>{r.label}</td>
                <td>{r.count}</td>
                <td>{r.shown === r.label ? 'the same' : r.shown}</td>
                <td>{r.category || '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
