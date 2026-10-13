/**
 * bootstrap-club.int (wave F WP-3, #37): the bootstrap script's orchestration against an empty test schema. A dry run writes nothing
 * and prints a per-field diff for a saved global, a confirmed run creates the globals, the admin and the media, a re-run changes
 * nothing, `--force` fills only empty fields, no column default carries a preset word, and the neutral site renders as the fictional
 * club with nothing of the preset in visible text, metadata or JSON-LD. A last test proves a truly blank database works.
 *
 * The preset and the club env are module-level (`config/site.ts`, `club-defaults.ts`), so every env value is set BEFORE the first
 * import below and everything is imported dynamically.
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import pg from 'pg'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { prerender } from 'react-dom/static'
import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ClubProfile } from '@/lib/club-profile'

// next/font/google is a build-time transform; the shell needs a stand-in to render in tests.
vi.mock('next/font/google', () => ({ Inter: () => ({ variable: 'font-var', className: 'font-cls', style: { fontFamily: 'x' } }) }))
vi.mock('next/font/local', () => ({ default: () => ({ variable: 'font-var', className: 'font-cls', style: { fontFamily: 'x' } }) }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined }), headers: async () => new Headers() }))
vi.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined }), useSearchParams: () => new URLSearchParams() }))
vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: <T,>(fn: () => Promise<T>) => fn }))

const root = path.resolve(__dirname, '../..')
const CLUB_DIR = path.join(root, 'clubs/example-fc')
const PASSWORD = 'int-test-admin-pass-1'
const PRESET_WORDS = /lang\s*lang|caldermeade|llcc|ccca/i
const COLUMN_DEFAULT_WORDS = /lang\s*lang|caldermeade|llcc|ccca|cardinia|victoria/i
const CLUB_ENV: Record<string, string> = {
  CLUB_PRESET: 'template',
  CANONICAL_HOST: 'riverbend-cc.example',
  COOKIE_PREFIX: 'rbcc',
  PLAYHQ_ORG_ID: '00000000-0000-0000-0000-000000000000',
  PLAYHQ_TEAM_PREFIX: 'Riverbend',
  PLAYHQ_CLIENT_ID: '',
  PLAYHQ_CLUB_URL: 'https://playhq.example/riverbend',
  CLUB_TIMEZONE: 'Australia/Sydney',
  CLUB_LOCALE: 'en-AU',
  OFFICE_CURRENCY: 'AUD',
  INITIAL_ADMIN_PASSWORD: PASSWORD,
}

let payload: Payload
let profile: ClubProfile
let tmp: string
const mediaFiles = new Set<string>()
const mediaDirBefore = existsSync(path.join(root, 'media')) ? new Set(readdirSync(path.join(root, 'media'))) : new Set<string>()

type Run = typeof import('@/payload/bootstrap/run-bootstrap')
let run: Run
const text = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/\s+/g, ' ')

const opts = (over: Partial<Parameters<Run['runBootstrap']>[2]> = {}): Parameters<Run['runBootstrap']>[2] => ({
  confirm: false,
  baseDir: CLUB_DIR,
  env: { ...process.env, ...CLUB_ENV },
  adminPassword: PASSWORD,
  ...over,
})

async function counts() {
  const n = async (collection: 'users' | 'media') => (await payload.count({ collection, overrideAccess: true })).totalDocs
  const saved = async (slug: 'club' | 'theme' | 'social-settings' | 'office-settings' | 'site-settings') => Boolean(((await payload.findGlobal({ slug, depth: 0, overrideAccess: true })) as { updatedAt?: string }).updatedAt)
  return { users: await n('users'), media: await n('media'), club: await saved('club'), theme: await saved('theme'), social: await saved('social-settings'), office: await saved('office-settings'), site: await saved('site-settings') }
}

async function wipe() {
  const { wipeTestData } = await import('./helpers')
  await wipeTestData(payload)
}

beforeAll(async () => {
  for (const [k, v] of Object.entries(CLUB_ENV)) vi.stubEnv(k, v)
  vi.resetModules()
  tmp = mkdtempSync(path.join(os.tmpdir(), 'bootstrap-int-'))
  const { getTestPayload } = await import('./helpers')
  payload = await getTestPayload()
  run = await import('@/payload/bootstrap/run-bootstrap')
  const { validateClubProfile } = await import('@/lib/club-profile')
  const res = validateClubProfile(JSON.parse(readFileSync(path.join(CLUB_DIR, 'profile.json'), 'utf8')), { statAsset: () => ({ size: 1000 }) })
  if (!res.ok) throw new Error(JSON.stringify(res.errors))
  profile = res.profile
}, 180_000)

afterAll(async () => {
  const media = await payload.find({ collection: 'media', limit: 50, depth: 0, overrideAccess: true }).catch(() => null)
  for (const d of media?.docs ?? []) if (d.filename) mediaFiles.add(d.filename)
  await wipe()
  const { destroyTestPayload } = await import('./helpers')
  await destroyTestPayload(payload)
  // Files the confirmed run wrote under ./media (git-ignored): remove only the ones this file created.
  const dir = path.join(root, 'media')
  if (existsSync(dir)) for (const f of readdirSync(dir)) if (!mediaDirBefore.has(f)) rmSync(path.join(dir, f), { force: true })
  rmSync(tmp, { recursive: true, force: true })
})

describe('dry run', () => {
  it('writes nothing on an empty database and plans every global, the admin and the assets', async () => {
    const before = await counts()
    const report = await run.runBootstrap(payload, profile, opts())
    expect(report.mode).toBe('dry-run')
    expect(await counts()).toEqual(before)
    expect(before).toMatchObject({ users: 0, media: 0, club: false, theme: false })
    expect(report.globals.map((g) => g.slug)).toEqual(['club', 'theme', 'social-settings', 'office-settings', 'site-settings'])
    expect(report.admin).toBe('create')
    expect(report.assets.map((a) => a.action)).toEqual(['upload', 'upload', 'upload', 'upload'])
    expect(report.envProblems).toEqual([])
    expect(report.envLines).toContain('CANONICAL_HOST=riverbend-cc.example')
    expect(report.nextSteps.join('\n')).toContain('returnPath')
  })

  it('prints a per-field diff when a club row already exists and still writes nothing', async () => {
    await payload.updateGlobal({ slug: 'club', data: { name: 'Custom FC', tagline: '' }, overrideAccess: true, context: { disableRevalidate: true } })
    const before = await counts()
    const report = await run.runBootstrap(payload, profile, opts())
    expect(await counts()).toEqual(before)
    expect(report.refusal).toMatch(/already has a saved Club details/)
    const club = report.globals.find((g) => g.slug === 'club')!
    expect(club.saved).toBe(true)
    expect(club.diffs.find((d) => d.path === 'name')).toMatchObject({ saved: 'Custom FC', profile: 'Riverbend Cricket Club', action: 'keep' })
    expect(club.diffs.find((d) => d.path === 'tagline')).toMatchObject({ action: 'fill', profile: 'Riverbend, Westland' })
    const printed = run.formatReport(report)
    expect(printed).toContain('keep name')
    expect(printed).toContain('fill tagline')
    await wipe()
  })
})

describe('confirmed run', () => {
  it('creates the globals, the admin and the media, and writes the env checklist', async () => {
    const checklistPath = path.join(tmp, 'env-checklist.md')
    const report = await run.runBootstrap(payload, profile, opts({ confirm: true, checklistPath }))
    expect(report.mode).toBe('applied')
    expect(report.refusal).toBeNull()
    expect(report.admin).toBe('created')
    expect(report.assets.map((a) => a.action)).toEqual(['uploaded', 'uploaded', 'uploaded', 'uploaded'])

    const club = (await payload.findGlobal({ slug: 'club', depth: 1, overrideAccess: true })) as unknown as Record<string, unknown> & { logo: { filename: string }; favicon: unknown; heroImage: unknown; ogImage: unknown; address: Record<string, string> }
    expect(club).toMatchObject({ name: 'Riverbend Cricket Club', shortName: 'Riverbend CC', tagline: 'Riverbend, Westland', email: 'info@riverbend-cc.example', siteUrl: 'https://riverbend-cc.example', locale: 'en-AU', ogLocale: 'en_AU' })
    expect(club.address).toMatchObject({ locality: 'Riverbend', region: 'Westland', country: 'AU' })
    for (const slot of ['logo', 'favicon', 'heroImage', 'ogImage'] as const) expect(club[slot], slot).toBeTruthy()
    const theme = (await payload.findGlobal({ slug: 'theme', depth: 0, overrideAccess: true })) as unknown as { palette: Record<string, string>; shades: Record<string, string>; headingFont: string }
    expect(theme.palette.accent.toUpperCase()).toBe(profile.theme.accent.toUpperCase())
    expect(theme.headingFont).toBe('oswald')
    expect(theme.shades.accentDeep).toMatch(/^#/)
    const office = (await payload.findGlobal({ slug: 'office-settings', depth: 0, overrideAccess: true })) as unknown as { currency: string }
    expect(office.currency).toBe('AUD')
    const c = await counts()
    expect(c).toMatchObject({ users: 1, media: 4, club: true, theme: true, social: true, office: true, site: true })
    const admin = (await payload.find({ collection: 'users', where: { email: { equals: 'admin@riverbend-cc.example' } }, overrideAccess: true, depth: 0 })).docs[0]
    expect(admin).toMatchObject({ role: 'admin', name: 'Club admin' })
    expect(existsSync(checklistPath)).toBe(true)
    const checklist = readFileSync(checklistPath, 'utf8')
    expect(checklist).toContain('Riverbend Cricket Club')
    expect(checklist).not.toContain(PASSWORD)
  })

  it('the admin can sign in with INITIAL_ADMIN_PASSWORD, and the profile holds no password', async () => {
    const login = await payload.login({ collection: 'users', data: { email: 'admin@riverbend-cc.example', password: PASSWORD } })
    expect(login.token).toBeTruthy()
    expect(readFileSync(path.join(CLUB_DIR, 'profile.json'), 'utf8')).not.toMatch(/password/i)
  })

  it('a second run without --force changes nothing and says why', async () => {
    const before = await counts()
    const club1 = JSON.stringify(await payload.findGlobal({ slug: 'club', depth: 0, overrideAccess: true }))
    const report = await run.runBootstrap(payload, profile, opts({ confirm: true }))
    expect(report.mode).toBe('refused')
    expect(report.refusal).toMatch(/--force/)
    expect(await counts()).toEqual(before)
    expect(JSON.stringify(await payload.findGlobal({ slug: 'club', depth: 0, overrideAccess: true }))).toBe(club1)
  })

  it('--force keeps a customised club name and fills only empty fields', async () => {
    await payload.updateGlobal({ slug: 'club', data: { name: 'Custom FC', tagline: '' }, overrideAccess: true, context: { disableRevalidate: true } })
    const usersBefore = (await counts()).users
    const report = await run.runBootstrap(payload, profile, opts({ confirm: true, force: true }))
    expect(report.mode).toBe('applied')
    const club = (await payload.findGlobal({ slug: 'club', depth: 0, overrideAccess: true })) as unknown as { name: string; tagline: string; shortName: string }
    expect(club.name).toBe('Custom FC')
    expect(club.tagline).toBe('Riverbend, Westland')
    expect(club.shortName).toBe('Riverbend CC')
    const c = await counts()
    expect(c.users).toBe(usersBefore)
    expect(c.media).toBe(4)
    expect(report.admin).toBe('exists')
  })
})

describe('refusals', () => {
  it('writes nothing when the environment disagrees with the profile', async () => {
    await wipe()
    const before = await counts()
    const report = await run.runBootstrap(payload, profile, opts({ confirm: true, env: { ...process.env, ...CLUB_ENV, CANONICAL_HOST: 'someone-else.example', COOKIE_PREFIX: 'llcc' } }))
    expect(report.mode).toBe('refused')
    expect(report.envProblems.join('\n')).toMatch(/CANONICAL_HOST/)
    expect(report.envProblems.join('\n')).toMatch(/COOKIE_PREFIX/)
    expect(await counts()).toEqual(before)
  })

  it('skips assets and says to upload in the admin when a Blob token is set without ALLOW_REMOTE_BLOB', async () => {
    const before = await counts()
    const report = await run.runBootstrap(payload, profile, opts({ env: { ...process.env, ...CLUB_ENV, BLOB_READ_WRITE_TOKEN: 'token-for-test' } }))
    expect(report.assets.every((a) => a.action === 'skipped')).toBe(true)
    expect(report.notes.join('\n')).toContain('upload them in the admin')
    expect(await counts()).toEqual(before)
  })

  it('--skip-assets and --skip-admin leave media and users alone', async () => {
    await run.runBootstrap(payload, profile, opts({ confirm: true, skipAssets: true, skipAdmin: true }))
    const c = await counts()
    expect(c).toMatchObject({ users: 0, media: 0, club: true })
    await wipe()
  })
})

describe('no club words in the schema or the rendered site', () => {
  it('no column default in the payload schema carries a preset word', async () => {
    const { sql } = await import('@payloadcms/db-postgres/drizzle')
    const res = (await payload.db.drizzle.execute(sql`SELECT table_name, column_name, column_default FROM information_schema.columns WHERE table_schema = 'payload' AND column_default IS NOT NULL`)) as unknown as { rows: { table_name: string; column_name: string; column_default: string }[] }
    expect(res.rows.length).toBeGreaterThan(50)
    expect(res.rows.filter((r) => COLUMN_DEFAULT_WORDS.test(r.column_default)).map((r) => `${r.table_name}.${r.column_name}`)).toEqual([])
  })

  it('renders the bootstrapped club with its own name and accent and none of the preset in visible text, metadata or JSON-LD', async () => {
    await run.runBootstrap(payload, profile, opts({ confirm: true }))
    vi.resetModules()
    const layout = await import('@/app/(frontend)/layout')
    const home = (await import('@/app/(frontend)/page')).default
    const { Shell } = { Shell: layout.default }
    const meta = await layout.generateMetadata()
    // The shell and sections are async server components; `prerender` waits for them (renderToStaticMarkup cannot).
    const { prelude } = await prerender(createElement(Shell, null, await home()))
    const html = await new Response(prelude).text()
    const visible = text(html)
    expect(visible).toContain('Riverbend Cricket Club')
    expect(visible).toMatch(/with Riverbend/)
    expect(visible).not.toMatch(PRESET_WORDS)
    expect(JSON.stringify(meta)).toContain('Riverbend Cricket Club')
    expect(JSON.stringify(meta)).not.toMatch(PRESET_WORDS)
    const jsonLd = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1])
    for (const j of jsonLd) expect(j).not.toMatch(PRESET_WORDS)
    // The theme <style> carries the example accent as --brand-gold channels (set from the saved theme global).
    const { hexToChannels } = await import('@/lib/theme/tokens')
    const accent = hexToChannels(profile.theme.accent)
    expect(html).toMatch(new RegExp(`--brand-gold:\\s*${accent}`))
  })

  it('the sitemap, robots and the fixtures page carry the club and none of the preset', async () => {
    const robots = await (await import('@/app/robots')).default()
    const sitemap = await (await import('@/app/sitemap')).default()
    expect(JSON.stringify(robots)).toContain('riverbend-cc.example')
    expect(JSON.stringify(robots)).not.toMatch(PRESET_WORDS)
    expect(sitemap.length).toBeGreaterThan(5)
    expect(JSON.stringify(sitemap)).not.toMatch(PRESET_WORDS)
    expect(sitemap.every((e) => e.url.startsWith('https://riverbend-cc.example'))).toBe(true)
    const fixtures = (await import('@/app/(frontend)/fixtures/page')).default
    const out = text(renderToStaticMarkup((await fixtures({ searchParams: Promise.resolve({}) } as never)) as React.ReactElement))
    expect(out).not.toMatch(PRESET_WORDS)
  })

  it('metadata of the Documents page labels the association section from the club setting', async () => {
    const { categoryLabel } = await import('@/lib/documents')
    expect(categoryLabel('Association directory', 'Riverbend Association')).toBe('Riverbend Association')
    expect(categoryLabel('Policies', 'Riverbend Association')).toBe('Policies')
  })
})

describe('a truly blank database', () => {
  it('runs the script end to end into a throwaway database (migrations included), then drops it', async () => {
    const admin = new pg.Client({ connectionString: 'postgres://postgres:postgres@127.0.0.1:54329/postgres' })
    const name = `langlang_boot_${Math.random().toString(36).slice(2, 10)}`
    await admin.connect()
    try {
      await admin.query(`CREATE DATABASE ${name}`)
      const uri = `postgres://postgres:postgres@127.0.0.1:54329/${name}`
      // The migrations are schema-qualified to `payload`, so a second schema cannot replay them; a second database can. Work on a
      // copy of the example folder so the generated env checklist does not land in the repository.
      const clubDir = path.join(tmp, 'club')
      cpSync(CLUB_DIR, clubDir, { recursive: true })
      const env = { ...process.env, ...CLUB_ENV, DATABASE_URI: uri, PAYLOAD_PUSH: 'false', BLOB_READ_WRITE_TOKEN: '', GUARD_NO_DELAY: '1' } as NodeJS.ProcessEnv
      const args = ['run', 'payload/scripts/bootstrap-club.ts', '--', '--profile', path.join(clubDir, 'profile.json'), '--target', `127.0.0.1/${name}`]
      // Dry run on the blank database: prints the plan, creates no table.
      const dry = execFileSync('./node_modules/.bin/payload', args, { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
      expect(dry).toContain('DRY RUN')
      expect(dry).toMatch(/Migrations: \d+ pending/)
      const pool = new pg.Pool({ connectionString: uri })
      expect((await pool.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'payload'")).rows[0].n).toBe(0)
      const out = execFileSync('./node_modules/.bin/payload', [...args, '--confirm'], { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
      expect(out).toContain('APPLIED')
      expect((await pool.query('SELECT name, short_name FROM payload.club')).rows).toEqual([{ name: 'Riverbend Cricket Club', short_name: 'Riverbend CC' }])
      expect((await pool.query("SELECT count(*)::int AS n FROM payload.users WHERE role = 'admin'")).rows[0].n).toBe(1)
      expect((await pool.query('SELECT count(*)::int AS n FROM payload.media')).rows[0].n).toBe(4)
      expect(existsSync(path.join(clubDir, 'env-checklist.md'))).toBe(true)
      expect(out).not.toContain(PASSWORD)
      await pool.end()
    } finally {
      await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)
      await admin.end()
    }
  }, 300_000)
})
