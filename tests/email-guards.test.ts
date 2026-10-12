import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadSanitizedConfig } from './helpers/sanitized-config'

/**
 * Source guards for bulk email (wave D WP-6): one door to the provider, the module is dark when mail is off, and the public
 * unsubscribe side touches nothing but the opt-out.
 */
const root = path.resolve(__dirname, '..')
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8')

function walk(rel: string, out: string[] = []): string[] {
  const full = path.join(root, rel)
  if (!existsSync(full)) return out
  if (statSync(full).isDirectory()) {
    for (const e of readdirSync(full)) if (e !== 'node_modules' && e !== '.next') walk(path.join(rel, e), out)
  } else if (/\.(ts|tsx)$/.test(rel)) out.push(rel)
  return out
}

const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n')

describe('email guards', () => {
  it('only lib/email/send.ts hands a message to an adapter', () => {
    const hits: string[] = []
    for (const f of ['app', 'lib', 'payload', 'components'].flatMap((r) => walk(r))) {
      if (f === 'lib/email/send.ts' || f.startsWith('lib/email/adapters/')) continue
      if (/\badapter\.send\(|\.send\(\s*\{?\s*(to|message|m)\b/.test(code(f))) hits.push(f)
    }
    expect(hits).toEqual([])
    const send = code('lib/email/send.ts')
    expect((send.match(/adapter\.send\(/g) ?? []).length).toBe(2)
  })

  it('sendCampaignMessage checks the list before it sends and demands the unsubscribe headers', () => {
    const send = code('lib/email/send.ts')
    const fn = send.slice(send.indexOf('export async function sendCampaignMessage'))
    expect(fn.indexOf('isAddressSuppressed')).toBeGreaterThan(-1)
    expect(fn.indexOf('isAddressSuppressed')).toBeLessThan(fn.indexOf('adapter.send('))
    expect(fn).toContain('List-Unsubscribe-Post')
  })

  it('sendTransactional has one caller (the reset email) and campaigns never use it', () => {
    const callers = ['app', 'lib', 'payload'].flatMap((r) => walk(r)).filter((f) => f !== 'lib/email/send.ts' && /\bsendTransactional\(/.test(code(f)))
    expect(callers).toEqual(['lib/email/reset-mail.ts'])
  })

  it('every email route and view answers as if absent when email is off, before anything else', () => {
    for (const f of walk('app/api/admin/office/email').filter((x) => x.endsWith('route.ts'))) {
      const text = code(f)
      expect(text, f).toContain('emailEnabled()')
      expect(text.indexOf('emailEnabled()'), f).toBeLessThan(text.indexOf('requireOfficeAdmin('))
      expect(text, f).toMatch(/export async function POST/)
      expect(text, f).not.toMatch(/export async function GET/)
    }
    const cron = code('app/api/cron/email-batch/route.ts')
    expect(cron).toContain('emailEnabled()')
    expect(cron).toContain('cronAuthorized(')
    for (const f of ['payload/components/OfficeEmailView.tsx', 'payload/components/OfficeEmailCampaignView.tsx']) expect(code(f), f).toMatch(/if \(!emailEnabled\(\)\) notFound\(\)/)
  })

  it('the queries layer checks admin and the gate in one place', () => {
    const q = code('lib/email-office-queries.ts')
    expect(q).toContain('isAdminUser(user as never) && emailEnabled()')
    for (const fn of ['getEmailOverview', 'getCampaignPage', 'createCampaign', 'saveCampaign', 'sendTestCopy', 'startSend', 'stopSend', 'runBatchForAdmin', 'addManualSuppression', 'removeSuppression']) {
      const at = q.indexOf(`export async function ${fn}(`)
      expect(at, fn).toBeGreaterThan(-1)
      expect(q.slice(at, at + 260), fn).toContain('adminOn(user)')
    }
  })

  it('the public opt-out imports no mail sender, no members data and no office queries', () => {
    for (const f of [...walk('app/(frontend)/unsubscribe'), 'app/api/public/unsubscribe/[token]/route.ts', 'lib/email/unsubscribe.ts']) {
      expect(code(f), f).not.toMatch(/email\/send|email\/campaign|members-queries|collection:\s*'members'|adapter/)
    }
    const route = code('app/api/public/unsubscribe/[token]/route.ts')
    expect(route).toMatch(/export async function POST/)
    // GET exists only to send a browser on to the confirm page: it must never touch the database.
    const get = /export async function GET[\s\S]*?\n}\n/.exec(route)?.[0] ?? ''
    expect(get).toContain('303')
    expect(get).not.toMatch(/payload|unsubscribe\(|resolveUnsub/)
  })

  it('opening the unsubscribe page writes nothing: only the actions call the writers', () => {
    expect(code('app/(frontend)/unsubscribe/[token]/page.tsx')).not.toMatch(/\bunsubscribe\(payload|\bundo\(payload|addSuppression|removeUnsubscribed/)
    expect(code('app/(frontend)/unsubscribe/[token]/actions.ts')).toContain("'use server'")
  })

  it('the Payload email adapter imports nothing server-only, so the payload CLI can load the config', () => {
    expect(code('lib/email/payload-adapter.ts')).not.toMatch(/server-only|from '@\/lib\/(payload|club|theme)/)
    expect(code('lib/email/payload-adapter.ts')).toMatch(/await import\('\.\/reset-mail'\)/)
  })

  it('wording and sender come from config: no club name and no regional law in the email code', () => {
    const banned = /\b(spam act|can-spam|gdpr|pecr|lang lang)\b/i
    const hits = [...walk('lib/email'), 'lib/email-office-queries.ts', 'payload/collections/email.ts', ...walk('app/(frontend)/unsubscribe'), ...walk('app/api/admin/office/email'), 'payload/components/OfficeEmailView.tsx', 'payload/components/OfficeEmailCampaignView.tsx'].filter((f) => banned.test(code(f)))
    expect(hits).toEqual([])
  })

  it('campaigns, recipients and suppressions have no REST write for anyone, and a sent campaign cannot be changed', async () => {
    const config = await loadSanitizedConfig()
    type A = (a: { req: { user: unknown } }) => unknown
    const admin = { id: 1, role: 'admin' }
    for (const slug of ['email-recipients', 'email-suppressions']) {
      const access = config.collections.find((c) => c.slug === slug)!.access as unknown as Record<string, A>
      for (const op of ['create', 'update', 'delete']) expect(access[op]({ req: { user: admin } }), `${slug} ${op}`).toBe(false)
      expect(access.read({ req: { user: admin } })).toBe(true)
      expect(access.read({ req: { user: { id: 2, role: 'editor' } } })).toBe(false)
    }
    const camp = config.collections.find((c) => c.slug === 'email-campaigns')!.access as unknown as Record<string, A>
    for (const op of ['update', 'delete']) expect(camp[op]({ req: { user: admin } }), op).toEqual({ status: { equals: 'draft' } })
    expect(camp.create({ req: { user: admin } })).toBe(true)
    for (const op of ['create', 'read', 'update', 'delete']) expect(camp[op]({ req: { user: { id: 2, role: 'editor' } } }), op).toBe(false)
  }, 60_000)
})
