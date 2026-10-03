/**
 * ETL report (spec §12.1, §12.4): per-step counts plus every row that needs a human look —
 * orphans, flagged media, filename collisions, prefix fallbacks, coerced values.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type ReportItem = {
  step: string
  table: string
  id?: number | string
  field?: string
  url?: string
  kind: string
  detail?: string
}

export type StepCounts = { read: number; created: number; updated: number; deleted: number; skipped: number; planned: number }

export class EtlReport {
  readonly startedAt = new Date().toISOString()
  readonly steps: Record<string, StepCounts> = {}
  readonly items: ReportItem[] = []
  readonly media: Record<string, number> = {}

  constructor(readonly dryRun: boolean) {}

  counts(step: string): StepCounts {
    return (this.steps[step] ??= { read: 0, created: 0, updated: 0, deleted: 0, skipped: 0, planned: 0 })
  }

  add(item: ReportItem): void {
    this.items.push(item)
  }

  /**
   * Rows written across every step (created + updated + deleted, plus upload docs created by
   * the media branch): 0 on an idempotent re-run.
   */
  writes(): number {
    const rows = Object.values(this.steps).reduce((n, c) => n + c.created + c.updated + c.deleted, 0)
    const files = ['register', 'upload-local-asset', 'fallback-local', 'fallback-reupload'].reduce((n, k) => n + (this.media[k] ?? 0), 0)
    return rows + files
  }

  /**
   * What the media branch did per upload row in this run, keyed `<collection> <legacyUrl>`
   * (register / fallback-local / fallback-reupload / upload-local-asset). Verify uses it to
   * tell registered rows from fallbacks instead of guessing from the stored filename.
   */
  readonly files = new Map<string, string>()

  /** Dry run only: legacyUrls and filenames a real run would have claimed so far, per collection. */
  readonly claimed = { urls: new Set<string>(), filenames: new Set<string>() }

  /** Verify outcome, written into the JSON report. */
  verify: unknown = null

  mediaAction(kind: string): void {
    this.media[kind] = (this.media[kind] ?? 0) + 1
  }

  summary(): string {
    const lines = [`ETL ${this.dryRun ? 'DRY RUN' : 'run'} — started ${this.startedAt}`]
    for (const [step, c] of Object.entries(this.steps)) {
      lines.push(
        `  ${step.padEnd(16)} read ${c.read}  created ${c.created}  updated ${c.updated}  skipped ${c.skipped}${c.deleted ? `  deleted ${c.deleted}` : ''}${this.dryRun ? `  planned ${c.planned}` : ''}`,
      )
    }
    if (Object.keys(this.media).length) {
      lines.push(`  media: ${Object.entries(this.media).map(([k, v]) => `${k} ${v}`).join(', ')}`)
    }
    if (this.items.length) {
      lines.push(`  ${this.items.length} item(s) to review:`)
      for (const i of this.items) {
        lines.push(`    [${i.kind}] ${i.table}${i.id !== undefined ? `#${i.id}` : ''}${i.field ? `.${i.field}` : ''}${i.url ? ` ${i.url}` : ''}${i.detail ? ` — ${i.detail}` : ''}`)
      }
    }
    return lines.join('\n')
  }

  async write(file: string): Promise<void> {
    await mkdir(path.dirname(path.resolve(file)), { recursive: true })
    await writeFile(
      file,
      JSON.stringify({ startedAt: this.startedAt, dryRun: this.dryRun, writes: this.writes(), steps: this.steps, media: this.media, items: this.items, verify: this.verify }, null, 2),
    )
  }
}
