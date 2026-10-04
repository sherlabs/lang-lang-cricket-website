/**
 * Operator script: merge duplicate `people` rows (the same human entered once per job) into one
 * record with `moreRoles`. DRY RUN by default: it only reports.
 *
 *   pnpm dedupe:people --target 127.0.0.1/langlang_dev
 *   pnpm dedupe:people --target 127.0.0.1/langlang_dev --apply --confirm
 *   ... --prefer-primary   keep the primary row's value when two rows disagree on phone/email/photo/player
 *
 * Groups by exact normalised name (trim, collapse spaces, case-insensitive). Keeps the row with a
 * photo, then the most filled fields, then the lowest id; fills its EMPTY phone/email/photo/player
 * from the others; adds the others' role/section as "other jobs"; deletes the duplicates. When two
 * rows hold different non-empty values it never guesses: the group is reported and skipped unless
 * --prefer-primary. Idempotent. The legacy ETL re-creates legacy rows by id, so run this (then
 * link-people-players) after every ETL run (see the cutover checklist). Standard database guard.
 */
import config from '@payload-config'
import { getPayload } from 'payload'
import { runDedupe } from './dedupe-people-lib'
import { guard } from './_guard'

async function main() {
  const apply = process.argv.includes('--apply')
  await guard({ write: apply })
  const payload = await getPayload({ config })
  try {
    await runDedupe(payload, { apply, preferPrimary: process.argv.includes('--prefer-primary'), log: (l) => console.log(l) })
  } finally {
    await payload.destroy()
  }
}

try {
  await main()
} catch (err) {
  console.error(err)
  process.exit(1)
}
