/**
 * Read-only readiness check for a club deployment (wave F spec 5.5): every variable of config/env-manifest.ts as set, missing or
 * invalid (names and statuses only, never a value), plus any file under public/ that is still one of Lang Lang's originals.
 *   pnpm check:template
 * Exits 1 when a required variable is missing, any set variable is invalid, or (off Lang Lang) the favicon, apple-touch-icon,
 * share image or logo is still Lang Lang's.
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { checkEnv, envProblems } from '../config/env-manifest'
import { isLangLangDeployment } from '../config/site'
import { LANG_LANG_ARTWORK } from '../config/lang-lang-artwork'

const root = path.resolve(import.meta.dirname, '..')

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const full = path.join(dir, e)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

const reports = checkEnv(process.env)
const groups = [...new Set(reports.map((r) => r.group))]
for (const g of groups) {
  console.log(`\n${g}`)
  for (const r of reports.filter((x) => x.group === g)) {
    const label = r.status === 'default' ? 'not set (default applies)' : r.status
    console.log(`  ${r.status === 'set' ? 'ok ' : r.status === 'default' ? '.. ' : '!! '} ${r.name.padEnd(30)} ${label}${r.required && r.status === 'missing' ? ' (required)' : ''}`)
  }
}

const known = new Set(LANG_LANG_ARTWORK)
const leftovers = walk(path.join(root, 'public'))
  .filter((f) => known.has(createHash('sha256').update(readFileSync(f)).digest('hex')))
  .map((f) => path.relative(root, f))
console.log('\nLang Lang artwork still in public/')
if (leftovers.length) {
  const byDir = new Map<string, number>()
  for (const f of leftovers) byDir.set(path.dirname(f), (byDir.get(path.dirname(f)) ?? 0) + 1)
  for (const [dir, n] of byDir) console.log(`  !! ${dir}  ${n} file(s) still match Lang Lang's originals (replace or delete them in your copy)`)
} else console.log('  ok  none')

// The four files a visitor sees first. On a club that is not Lang Lang they must not still be Lang Lang's: that is a failure, not a hint.
const KEY_FILES = ['public/favicon.ico', 'public/apple-touch-icon.png', 'public/og-image.jpg', 'public/assets/branding/logo.png']
const keyLeftovers = isLangLangDeployment(process.env) ? [] : KEY_FILES.filter((f) => leftovers.includes(f))
for (const f of keyLeftovers) console.log(`  FAIL ${f} is still Lang Lang's picture; replace it with your club's.`)

const problems = envProblems(reports)
const failures = problems.length + keyLeftovers.length
console.log(`\n${failures ? `${failures} problem(s): ${[...problems.map((p) => p.name), ...keyLeftovers].join(', ')}` : 'Environment looks ready.'}`)
process.exit(failures ? 1 : 0)
