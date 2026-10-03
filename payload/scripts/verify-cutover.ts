/**
 * Standalone cutover verification (spec §12.2 step 18, §13.2 step 7). Read-only on both sides.
 *
 *   pnpm verify:cutover --target 127.0.0.1/langlang_dev --blob-store-id <id> [--preview-rehearsal] [--only stories,players]
 *                       [--source-schema public] [--report tmp/verify.json]
 *
 * Compares LEGACY_DATABASE_URL (read-only, unpooled) with the Payload database: ids and counts,
 * preserved fields, story text and images, the per-row plugin URL of every registered upload,
 * sequences, and (with a Blob token) a HEAD sample. A store id (token or --blob-store-id) is required. Exits 1 when any check fails.
 */
import config from '@payload-config'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getPayload } from 'payload'
import { blobToken } from '../env'
import { argValue, guard } from './_guard'
import { resolveLegacyStore } from './etl/media'
import { openLegacySource } from './etl/source'
import { formatVerify, verifyCutover } from './etl/verify'

async function main(): Promise<boolean> {
  const argv = process.argv
  await guard({ write: false })
  const only = argValue(argv, '--only')?.split(',').map((s) => s.trim()).filter(Boolean)
  const reportFile = argValue(argv, '--report')
  const token = blobToken()
  const { storeId, writeStoreId } = resolveLegacyStore(token, argValue(argv, '--blob-store-id'), argv.includes('--preview-rehearsal'))
  if (storeId && writeStoreId && storeId !== writeStoreId) {
    console.warn(`[verify] legacy store "${storeId}" differs from the token's store "${writeStoreId}": legacy URLs are registered in place, new files go to the token's store (preview rehearsal)`)
  }
  // Without a store id own-store URLs are unrecognisable: every legacyUrl comparison would fail
  // spuriously and the registered-URL check could not run.
  if (!storeId) throw new Error('[verify] pass --blob-store-id <id> (the legacy Blob host) or run with BLOB_READ_WRITE_TOKEN')

  const source = await openLegacySource({ schema: argValue(argv, '--source-schema') ?? 'public' })
  const payload = await getPayload({ config })
  try {
    const result = await verifyCutover({ payload, source, storeId, token, publicDir: path.resolve(process.cwd(), 'public'), only })
    console.log(formatVerify(result))
    if (reportFile) {
      await mkdir(path.dirname(path.resolve(reportFile)), { recursive: true })
      await writeFile(reportFile, JSON.stringify(result, null, 2))
    }
    return result.ok
  } finally {
    await source.close()
    await payload.destroy()
  }
}

try {
  process.exit((await main()) ? 0 : 1)
} catch (err) {
  console.error(err)
  process.exit(1)
}
