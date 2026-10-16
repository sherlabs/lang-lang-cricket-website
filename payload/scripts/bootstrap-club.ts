/**
 * Stands a new club's site up from its profile (wave F spec 5.4, docs/template/new-club-checklist.md).
 *   pnpm bootstrap:club --profile clubs/<slug>/profile.json --target <host>/<db> [--confirm] [--force] [--skip-admin] [--skip-assets]
 * Dry run by default: validates, reads and prints the plan (including a per-field diff for every global that is already saved) and
 * writes nothing. `--confirm` applies it. `--force` fills only empty fields; it never overwrites a saved value. The first admin's
 * password comes from INITIAL_ADMIN_PASSWORD, never from the profile. No network call is made.
 */
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import config from '@payload-config'
import { getPayload } from 'payload'
import { validateClubProfile } from '../../lib/club-profile'
import { parseBootstrapArgs } from '../bootstrap/args'
import { formatReport, runBootstrap } from '../bootstrap/run-bootstrap'

async function main() {
  const args = parseBootstrapArgs(process.argv)
  console.log(`[bootstrap] target: ${args.guard.target}${args.confirm ? ' (WRITE)' : ' (dry run, read-only)'}`)
  const file = path.resolve(args.profilePath)
  const baseDir = path.dirname(file)
  const result = validateClubProfile(JSON.parse(readFileSync(file, 'utf8')), {
    statAsset: (rel) => {
      try {
        const st = statSync(path.join(baseDir, rel))
        return st.isFile() ? { size: st.size } : null
      } catch {
        return null
      }
    },
  })
  if (!result.ok) {
    console.error('[bootstrap] the profile is not valid:')
    for (const e of result.errors) console.error(`  ${e.path || '(file)'}: ${e.message}`)
    process.exit(1)
  }
  for (const w of result.warnings) console.log(`[bootstrap] note: ${w}`)
  if (args.confirm && !(args.guard.local && process.env.GUARD_NO_DELAY === '1')) {
    console.log('[bootstrap] writing in 5 s — Ctrl-C to abort')
    await new Promise((r) => setTimeout(r, 5000))
  }
  const payload = await getPayload({ config })
  try {
    const report = await runBootstrap(payload, result.profile, {
      confirm: args.confirm,
      force: args.force,
      skipAdmin: args.skipAdmin,
      skipAssets: args.skipAssets,
      baseDir,
      env: process.env,
      adminPassword: process.env.INITIAL_ADMIN_PASSWORD,
      checklistPath: path.join(baseDir, 'env-checklist.md'),
    })
    console.log(formatReport(report))
    if (report.mode === 'refused') process.exitCode = 1
  } finally {
    await payload.destroy()
  }
}

// Top-level await: `payload run` exits as soon as the import resolves.
try {
  await main()
} catch (err) {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
}
