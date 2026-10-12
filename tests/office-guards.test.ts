import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadSanitizedConfig } from './helpers/sanitized-config'

/**
 * Source guards for the club back office (wave D spec section 12). Personal data stays out of public code, every export goes through
 * the audited wrapper, and nothing office-related names a regional rule or a national law (that wording is configuration).
 */
const root = path.resolve(__dirname, '..')
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8')

function walk(rel: string, out: string[] = []): string[] {
  const full = path.join(root, rel)
  if (!existsSync(full)) return out
  if (statSync(full).isDirectory()) for (const e of readdirSync(full)) walk(path.join(rel, e), out)
  else if (/\.(ts|tsx)$/.test(rel)) out.push(rel)
  return out
}

/** Routes under `app/(frontend)` that may touch office data: the volunteer token page (the unsubscribe route joins when bulk email ships). */
const PUBLIC_OFFICE_ALLOWLIST: string[] = ['app/(frontend)/volunteer/[token]/page.tsx', 'app/(frontend)/volunteer/[token]/actions.ts']

const OFFICE_SOURCE = [
  ...walk('lib/office'),
  'lib/members-queries.ts',
  ...walk('lib').filter((f) => /-office-queries\.ts$/.test(f)),
  ...walk('app/api/admin/office'),
  ...walk('payload/components').filter((f) => path.basename(f).startsWith('Office')),
  'payload/collections/Members.ts',
  'payload/collections/OfficeAuditLog.ts',
  'payload/collections/officeAccess.ts',
  'payload/collections/MembershipTiers.ts',
  'payload/collections/Memberships.ts',
  'payload/collections/feeLedger.ts',
  'payload/collections/volunteers.ts',
  'payload/collections/meetings.ts',
  'payload/collections/CommitteeSeats.ts',
  'payload/collections/OfficeFiles.ts',
  'payload/collections/diary.ts',
  'payload/access/officeBearer.ts',
  'lib/volunteer-link.ts',
  'lib/volunteer-public.ts',
  ...walk('app/(frontend)/volunteer'),
  'payload/globals/OfficeSettings.ts',
]

describe('office guards', () => {
  it('scans the office source', () => {
    expect(OFFICE_SOURCE.length).toBeGreaterThan(15)
  })

  it('no public page or public query layer imports the office or the members queries', () => {
    const publicFiles = [...walk('app/(frontend)'), ...walk('lib').filter((f) => /-queries\.ts$/.test(f) && f !== 'lib/members-queries.ts' && !/-office-queries\.ts$/.test(f)), ...walk('components')]
    const bad = publicFiles.filter((f) => !PUBLIC_OFFICE_ALLOWLIST.includes(f) && /members-queries|lib\/office|collection:\s*'(members|office-[a-z-]+)'/.test(read(f)))
    expect(bad).toEqual([])
  })

  it('there is no second CSV writer: exports use lib/stats/csv.ts', () => {
    expect(existsSync(path.join(root, 'lib/office/csv.ts'))).toBe(false)
    for (const f of OFFICE_SOURCE) expect(/function (csvCell|toCsv|needsGuard)\b/.test(read(f)), f).toBe(false)
  })

  it('every office export route goes through auditedExport; every other office route through requireOfficeAdmin', () => {
    const routes = walk('app/api/admin/office').filter((f) => f.endsWith('route.ts'))
    expect(routes.length).toBeGreaterThanOrEqual(4)
    for (const r of routes) {
      const text = read(r)
      if (r.includes('/export/')) expect(text, r).toContain('auditedExport')
      else if (r.includes('/meetings/')) expect(text, r).toContain('requireOfficeStaff') // the committee runs meetings; restricted items, documents and seat handover are checked inside the queries
      else if (r.includes('/diary/')) expect(text, r).toContain('requireOfficeStaff') // the season diary and plan are the committee's to edit; the queries re-check the caller
      else if (r.includes('/volunteers/')) expect(text, r).toContain('requireOfficeStaff') // the roster is the committee's; hours and paid status are admin-checked inside the queries
      else expect(text, r).toContain('requireOfficeAdmin')
      expect(text, r).toMatch(/export async function POST/)
      expect(text, r).not.toMatch(/export async function GET/)
    }
  })

  it('the audited export checks admin and origin, sets no-store and writes the audit row before streaming', () => {
    const text = read('lib/office/export.ts')
    expect(text).toContain('isAdminUser')
    expect(text).toContain('exportOriginOk')
    expect(text).toContain("'Cache-Control': 'private, no-store'")
    expect(text.indexOf('writeAudit(')).toBeGreaterThan(-1)
    expect(text.indexOf('writeAudit(')).toBeLessThan(text.indexOf('new Response(toCsv'))
  })

  it('office files name no national law and no regional term (that wording is configuration)', () => {
    const banned = /\b(spam act|privacy act|gdpr|can-spam|pecr|suburb|postcode|canteen licen[cs]e|affiliation|agm)\b/i
    const hits: string[] = []
    for (const f of OFFICE_SOURCE) {
      const lines = read(f).split('\n')
      lines.forEach((line, i) => {
        if (banned.test(line)) hits.push(`${f}:${i + 1} ${line.trim()}`)
      })
    }
    expect(hits).toEqual([])
  })

  it('the fee ledger takes no card data, no REST write, and its writes go through admin-checked server code', async () => {
    const config = await loadSanitizedConfig()
    for (const slug of ['fee-seasons', 'fee-charges', 'fee-payments', 'fee-waivers']) {
      const col = config.collections.find((c) => c.slug === slug)!
      for (const op of ['create', 'update', 'delete'] as const) {
        const fn = col.access[op] as (a: { req: { user: unknown } }) => unknown
        expect(fn({ req: { user: { id: 1, role: 'admin' } } }), `${slug} ${op} for an admin over REST`).toBe(false)
      }
    }
    const queries = read('lib/fees-office-queries.ts')
    // Every exported action starts with the admin check; the loaders are reached only from those and the pages.
    for (const fn of ['recordPayment', 'voidPayment', 'addWaiver', 'voidWaiver', 'voidCharge', 'addAdjustment', 'addMembership', 'removeMembership', 'addTier', 'copyTiers', 'closeSeason']) {
      const at = queries.indexOf(`export async function ${fn}(`)
      expect(at, fn).toBeGreaterThan(-1)
      expect(queries.slice(at, at + 400), fn).toContain('adminOnly(user)')
    }
  }, 60_000)

  it('the volunteer roster has no REST write, and every roster action checks the caller first', async () => {
    const config = await loadSanitizedConfig()
    for (const slug of ['volunteer-weeks', 'volunteer-shifts', 'volunteer-assignments', 'volunteer-availability', 'volunteer-hours']) {
      const col = config.collections.find((c) => c.slug === slug)!
      for (const op of ['create', 'update', 'delete'] as const) {
        const fn = col.access[op] as (a: { req: { user: unknown } }) => unknown
        expect(fn({ req: { user: { id: 1, role: 'admin' } } }), `${slug} ${op} for an admin over REST`).toBe(false)
      }
    }
    const queries = read('lib/volunteers-office-queries.ts')
    const admin = ['setAssignmentKind', 'addManualHours', 'voidHours']
    const staff = ['createWeeksForSeason', 'addWeek', 'setWeekStatus', 'deleteWeek', 'addShift', 'removeShift', 'assign', 'unassign', 'setAssignmentState', 'confirmWeek', 'reopenWeek', 'rotateVolunteerLink']
    for (const [list, guard] of [[admin, 'adminOnly(user)'], [staff, 'staffOnly(user)']] as const) {
      for (const fn of list) {
        const at = queries.indexOf(`export async function ${fn}(`)
        expect(at, fn).toBeGreaterThan(-1)
        expect(queries.slice(at, at + 300), fn).toContain(guard)
      }
    }
    // Paid or volunteer is derived from the shift type on the server; a form never supplies it to the roster actions an editor can reach.
    const assign = queries.slice(queries.indexOf('export async function assign('), queries.indexOf('async function assignmentContext('))
    expect(assign).not.toMatch(/raw\.kind/)
    // The editor-facing report is computed on the server, so no per-person row ever reaches a non-admin.
    expect(queries.slice(queries.indexOf('if (!admin) return'), queries.indexOf('if (!admin) return') + 120)).toContain('people: null')
  }, 60_000)

  it('the public volunteer page reads only the caller\'s own rows and shows no other person', () => {
    const publicLib = read('lib/volunteer-public.ts')
    expect(publicLib).toContain('claimedMemberId')
    // Every query of the person-specific collections is filtered to this member.
    expect(publicLib).toMatch(/volunteer-assignments[\s\S]{0,200}member: \{ equals: memberId \}/)
    expect(publicLib).toMatch(/volunteer-availability[\s\S]{0,200}member: \{ equals: memberId \}/)
    const page = read('app/(frontend)/volunteer/[token]/page.tsx')
    expect(page).toContain("ipHit(payload, 'vol'")
    expect(page).toContain('notFound()')
  })

  it('GraphQL stays disabled, so REST and the Local API are the only doors', async () => {
    const config = await loadSanitizedConfig()
    expect(config.graphQL.disable).toBe(true)
  }, 60_000)

  it('members is not exposed to any public query: the collection access is admin only', async () => {
    const config = await loadSanitizedConfig()
    const members = config.collections.find((c) => c.slug === 'members')!
    const asRead = members.access.read as (a: { req: { user: unknown } }) => unknown
    expect(asRead({ req: { user: undefined } })).toBe(false)
    expect(asRead({ req: { user: { id: 2, role: 'editor' } } })).toBe(false)
  })
  it('office-bearer files: own storage instance with client uploads off, not listed in the browser-upload instance, and served as attachments', () => {
    const cfg = read('payload.config.ts')
    // Exactly one instance names office-files, and it turns browser-direct uploads off.
    const instances = cfg.split('vercelBlobStorage({').slice(1)
    const own = (i: string) => i.slice(0, i.indexOf('}),') + 3)
    const withOffice = instances.map(own).filter((i) => i.includes("'office-files'"))
    expect(withOffice).toHaveLength(1)
    expect(withOffice[0]).toContain('clientUploads: false')
    const main = own(instances.find((i) => i.includes('clientUploads: true'))!)
    expect(main).not.toContain('office-files')
    // The access-controlled download route stays on: the storage option that switches it off must not be set for this collection.
    expect(withOffice[0].replace(/\/\/.*$/gm, '')).not.toContain('disablePayloadAccessControl')
    const files = read('payload/collections/OfficeFiles.ts')
    for (const header of ['Content-Disposition', 'nosniff', 'noindex', 'no-store']) expect(files).toContain(header)
    expect(files).toContain('OFFICE_FILE_MAX_BYTES')
    expect(files).not.toContain('clientUploadInMemory')
  })

  it('restricted meeting data and documents are read through access functions, not left to the collection default', () => {
    const text = read('payload/collections/meetings.ts')
    expect(text).toContain('staffReadsMeetingData')
    expect(text).toContain('staffReadsMeetingChild')
    expect(text).toContain('bearerOnly')
    expect(read('payload/access/officeBearer.ts')).toContain('isOfficeBearer')
  })

  it('the season diary and plan: committee edits, only an admin deletes, and every action checks the caller first', async () => {
    const config = await loadSanitizedConfig()
    const editor = { req: { user: { id: 2, role: 'editor' } } }
    const selector = { req: { user: { id: 3, role: 'selector' } } }
    for (const slug of ['diary-jobs', 'plan-pillars', 'plan-objectives']) {
      const access = config.collections.find((c) => c.slug === slug)!.access as unknown as Record<string, (a: unknown) => unknown>
      for (const op of ['read', 'create', 'update']) {
        expect(access[op](editor), `${slug} ${op} editor`).toBe(true)
        expect(access[op](selector), `${slug} ${op} selector`).toBe(false)
        expect(access[op]({ req: { user: undefined } }), `${slug} ${op} anonymous`).toBe(false)
      }
      expect(access.delete(editor), `${slug} delete editor`).toBe(false)
      expect(access.delete({ req: { user: { id: 1, role: 'admin' } } }), `${slug} delete admin`).toBe(true)
    }
    const queries = read('lib/diary-office-queries.ts')
    for (const fn of ['addJob', 'setJobStatus', 'setJobOwner', 'addStarterJobs', 'copyRepeatingJobs', 'addPillar', 'addObjective', 'saveObjective', 'addStarterPlan']) {
      const at = queries.indexOf(`export async function ${fn}(`)
      expect(at, fn).toBeGreaterThan(-1)
      expect(queries.slice(at, at + 450), fn).toContain('staffOnly(user)')
    }
    // The stable starter code can never be set from a form or the native editor.
    const sourceKey = config.collections.find((c) => c.slug === 'diary-jobs')!.fields.find((f) => 'name' in f && f.name === 'sourceKey') as { access?: Record<string, (a: unknown) => unknown> }
    expect(sourceKey.access?.update?.({ req: { user: { id: 1, role: 'admin' } } })).toBe(false)
    expect(sourceKey.access?.create?.({ req: { user: { id: 1, role: 'admin' } } })).toBe(false)
  }, 60_000)

  it('the starter diary and plan are club-neutral: no club or place name, no regional word', () => {
    const text = (read('lib/office/starter-diary.ts') + read('lib/office/starter-plan.ts')).replace(/\/\*[\s\S]*?\*\//g, '')
    const banned = /\b(affiliation|canteen licen[cs]e|suburb|state|postcode|spam act|agm|lang ?lang|caldermeade|victoria|melbourne|australia|gippsland|cricket victoria|playhq)\b/i
    const hits = text.split('\n').filter((l) => banned.test(l))
    expect(hits).toEqual([])
    // Default labels and settings text are neutral too.
    const settings = read('lib/office/diary.ts') + read('payload/globals/OfficeSettings.ts')
    expect(settings.split('\n').filter((l) => banned.test(l) && !/^\s*(\/\/|\*)/.test(l))).toEqual([])
  })
})
