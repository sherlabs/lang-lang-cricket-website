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
import { assertClubPreset, googleVerificationBody } from '../../config/site'
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
    // Template guards (wave F spec 5.2): the Lang Lang preset is explicit, the saved club row has no empty required field, and (with
    // --site-url pointing at the built app) the Search Console file is served with exactly its one-line body.
    const extra: { name: string; ok: boolean; checked: number; failures: string[]; notes: string[] }[] = []
    try {
      assertClubPreset()
      extra.push({ name: 'club preset', ok: true, checked: 1, failures: [], notes: [] })
    } catch (err) {
      extra.push({ name: 'club preset', ok: false, checked: 1, failures: [(err as Error).message], notes: [] })
    }
    const club = (await payload.findGlobal({ slug: 'club', depth: 0, overrideAccess: true })) as unknown as Record<string, unknown>
    const required = ['name', 'shortName', 'tagline', 'siteUrl', 'email', 'defaultTitle', 'defaultDescription']
    const empty = required.filter((k) => typeof club[k] !== 'string' || !(club[k] as string).trim())
    extra.push({ name: 'club details saved', ok: empty.length === 0, checked: required.length, failures: empty.map((k) => `club.${k} is empty`), notes: [] })
    const siteUrl = argValue(argv, '--site-url')
    const verifyFile = process.env.GOOGLE_SITE_VERIFICATION_FILE?.trim()
    if (siteUrl && verifyFile) {
      const want = googleVerificationBody(verifyFile)
      try {
        const body = await (await fetch(new URL(`/${verifyFile}`, siteUrl))).text()
        extra.push({ name: 'search console file', ok: body === want, checked: 1, failures: body === want ? [] : [`/${verifyFile} did not return exactly "${want}"`], notes: [] })
      } catch (err) {
        extra.push({ name: 'search console file', ok: false, checked: 1, failures: [(err as Error).message], notes: [] })
      }
    }
    result.checks.push(...extra)
    result.ok = result.ok && extra.every((c) => c.ok)
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
