/**
 * Legacy → Payload ETL (spec §12). Standalone, idempotent `payload run` script.
 *
 *   pnpm etl --target 127.0.0.1/langlang_dev [--dry-run] [--confirm] [--only documents,people]
 *            [--update] [--report tmp/etl-report.json] [--blob-store-id <id>] [--source-schema public]
 *
 * WP2 ships the orchestration skeleton and the steps for its own collections (site-settings,
 * club, documents, gallery-photos, sponsors, people, announcements); each step restores the
 * legacy timestamps of the rows it writes and bumps its id sequence. WP3–WP5 append their
 * steps; WP6 adds --reconcile-deletes and verify.
 *
 * Source: LEGACY_DATABASE_URL (unpooled, read-only). Target: DATABASE_URI via Payload, with
 * PAYLOAD_ETL=true (allowIDOnCreate). Writes use overrideAccess and context { etl, disableRevalidate }.
 */
import config from '@payload-config'
import path from 'node:path'
import { getPayload } from 'payload'
import { blobToken } from '../env'
import { argValue, guard } from './_guard'
import { storeIdFromToken, type EtlContext } from './etl/media'
import { EtlReport } from './etl/report'
import { openLegacySource } from './etl/source'
import { ETL_STEPS } from './etl/steps'

async function main() {
  const argv = process.argv
  const dryRun = argv.includes('--dry-run')
  const update = argv.includes('--update')
  const only = argValue(argv, '--only')?.split(',').map((s) => s.trim()).filter(Boolean)
  const reportFile = argValue(argv, '--report')
  const sourceSchema = argValue(argv, '--source-schema') ?? 'public'

  await guard({ write: !dryRun })
  if (!dryRun && process.env.PAYLOAD_ETL !== 'true') {
    throw new Error('[etl] PAYLOAD_ETL=true is required for a real run (legacy ids are preserved via allowIDOnCreate). Use `pnpm etl`.')
  }
  const unknown = only?.filter((s) => !ETL_STEPS.some((step) => step.name === s))
  if (unknown?.length) throw new Error(`[etl] unknown step(s) in --only: ${unknown.join(', ')} (known: ${ETL_STEPS.map((s) => s.name).join(', ')})`)

  const token = blobToken()
  const storeId = storeIdFromToken(token) ?? argValue(argv, '--blob-store-id')?.toLowerCase() ?? null
  if (!storeId) console.warn('[etl] no Blob token and no --blob-store-id: every Blob URL will be flagged instead of registered')

  const source = await openLegacySource({ schema: sourceSchema })
  const payload = await getPayload({ config })
  const report = new EtlReport(dryRun)
  const ctx: EtlContext = { payload, source, report, dryRun, update, storeId, token, publicDir: path.resolve(process.cwd(), 'public') }

  try {
    for (const step of ETL_STEPS) {
      if (only && !only.includes(step.name)) continue
      console.log(`[etl] ${dryRun ? 'planning' : 'running'} ${step.name}`)
      await step.run(ctx)
    }
  } finally {
    console.log(report.summary())
    if (reportFile) {
      await report.write(reportFile)
      console.log(`[etl] report written to ${reportFile}`)
    }
    await source.close()
    await payload.destroy()
  }
}

// Top-level await: `payload run` exits as soon as the import resolves.
try {
  await main()
} catch (err) {
  console.error(err)
  process.exit(1)
}
