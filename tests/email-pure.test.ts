import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_AUDIENCE, audienceJson, parseAudience, previewSentence, resolveAudience, type Candidate, type Contact } from '../lib/email/audience'
import { EMAIL_BACKOFF_MINUTES, EMAIL_MAX_ATTEMPTS, nextEmailAttempt } from '../lib/email/backoff'
import { emailEnabled, emailLimits, emailProvider, senderIdentity } from '../lib/email/env'
import { campaignHeaders, unsubscribeUrl } from '../lib/email/headers'
import { escapeHtml, parseTemplate, renderParagraphsHtml, renderPlain, templateProblem, usesTag } from '../lib/email/merge'
import { emailAdapterForPayload, RESET_MARKER, resetMarker } from '../lib/email/payload-adapter'
import { footerLines, renderCampaign, renderTransactional } from '../lib/email/render'
import { classifyStatus, createResendAdapter } from '../lib/email/adapters/resend'
import { mockAdapter, mockMail } from '../lib/email/adapters/mock'
import { emailHash, maskAddress, unsubToken, verifyUnsubToken } from '../lib/email/unsub-token'
import { deriveKey, HKDF_LABELS } from '../lib/secrets'
import { assertSafeEnv } from '../payload/env'
import { brandFromTheme } from '../lib/email/brand'
import { resolveTheme } from '../lib/theme/resolve'

const SECRET = 'a-test-secret-of-some-length-1234567'
const ctx = { firstName: 'Sam', clubName: 'Test Club', volunteerLink: 'https://club.example/volunteer/abc' }

describe('merge tags', () => {
  it('accepts the four tags, with and without a fallback', () => {
    expect(templateProblem('Hi {firstName}, {firstName|there}, {clubName} {volunteerLink}')).toBeNull()
    expect(usesTag('x {volunteerLink}', 'volunteerLink')).toBe(true)
    expect(usesTag('x', 'volunteerLink')).toBe(false)
  })
  it('refuses any other tag and names it', () => {
    expect(templateProblem('Hi {name}')).toContain('{name}')
    expect(templateProblem('Hi {clubName|x}')).toContain('{clubName|x}')
    expect(templateProblem('Hi {firstName|{x}}')).not.toBeNull()
    expect(parseTemplate('{ }').ok).toBe(false)
  })
  it('uses the fallback when there is no first name, and nothing when the tag has none', () => {
    expect(renderPlain('Hi {firstName|there}!', { ...ctx, firstName: null })).toBe('Hi there!')
    expect(renderPlain('Hi {firstName|there}!', { ...ctx, firstName: '  ' })).toBe('Hi there!')
    expect(renderPlain('Hi {firstName}!', { ...ctx, firstName: null })).toBe('Hi !')
    expect(renderPlain('{clubName}', ctx)).toBe('Test Club')
  })
  it('escapes substituted values so a name cannot inject markup', () => {
    const html = renderParagraphsHtml('Hi {firstName}', { ...ctx, firstName: '<b>x</b>"' })
    expect(html).not.toContain('<b>')
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;&quot;')
    expect(escapeHtml(`<a href="x">&'`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;')
  })
  it('escapes literal text in the message too, and turns blank lines into paragraphs and single breaks into <br>', () => {
    const html = renderParagraphsHtml('One <script>\nsame para\n\nTwo', ctx)
    expect(html).not.toContain('<script>')
    expect((html.match(/<p /g) ?? []).length).toBe(2)
    expect(html).toContain('<br>')
  })
  it('makes the volunteer link a link, and drops it when the person has none', () => {
    expect(renderParagraphsHtml('{volunteerLink}', ctx)).toContain('<a href="https://club.example/volunteer/abc"')
    expect(renderPlain('See {volunteerLink}', { ...ctx, volunteerLink: null })).toBe('See')
  })
})

describe('unsubscribe tokens and address hashes', () => {
  it('round-trips and rejects tampering', () => {
    const t = unsubToken(42, SECRET)
    expect(verifyUnsubToken(t, SECRET)).toBe(42)
    const [id, sig] = t.split('.')
    expect(verifyUnsubToken(`${Buffer.from('43').toString('base64url')}.${sig}`, SECRET)).toBeNull()
    expect(verifyUnsubToken(`${id}.${sig.slice(0, -2)}AA`, SECRET)).toBeNull()
    expect(verifyUnsubToken(`${id}.${sig}.x`, SECRET)).toBeNull()
    expect(verifyUnsubToken('', SECRET)).toBeNull()
    expect(verifyUnsubToken('x'.repeat(500), SECRET)).toBeNull()
    expect(verifyUnsubToken(null, SECRET)).toBeNull()
    expect(verifyUnsubToken(`${Buffer.from('0').toString('base64url')}.${sig}`, SECRET)).toBeNull()
    expect(verifyUnsubToken(t, 'another-secret-of-some-length-1234567')).toBeNull()
  })
  it('is signed under the emailUnsub label, not another one', () => {
    const forged = createHmac('sha256', deriveKey(HKDF_LABELS.volLink, SECRET)).update('rcpt:42').digest('base64url')
    expect(verifyUnsubToken(`${Buffer.from('42').toString('base64url')}.${forged}`, SECRET)).toBeNull()
    expect(HKDF_LABELS.emailUnsub).toBe('email-unsub')
  })
  it('a hash cannot stand in for a token signature', () => {
    const hash = Buffer.from(emailHash('a@b.co', SECRET), 'hex').toString('base64url')
    expect(verifyUnsubToken(`${Buffer.from('1').toString('base64url')}.${hash}`, SECRET)).toBeNull()
  })
  it('hashes the lowercased, trimmed address', () => {
    expect(emailHash(' Jo@Example.COM ', SECRET)).toBe(emailHash('jo@example.com', SECRET))
    expect(emailHash('a@example.com', SECRET)).not.toBe(emailHash('b@example.com', SECRET))
    expect(emailHash('a@example.com', SECRET)).toMatch(/^[0-9a-f]{64}$/)
  })
  it('masks an address for the screen', () => {
    expect(maskAddress('jane.doe@example.com')).toBe('j***@example.com')
    expect(maskAddress(null)).toBeNull()
    expect(maskAddress('nope')).toBeNull()
  })
})

describe('headers', () => {
  it('carries the one-click pair', () => {
    expect(campaignHeaders('https://club.example/unsubscribe/x')).toEqual({ 'List-Unsubscribe': '<https://club.example/unsubscribe/x>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' })
  })
  it('refuses an address that could break the header', () => {
    expect(() => campaignHeaders('https://a.example/x>\r\nBcc: y@z.co')).toThrow()
    expect(() => campaignHeaders('javascript:alert(1)')).toThrow()
  })
  it('builds the link from the configured site address, trimming a trailing slash', () => {
    expect(unsubscribeUrl('https://club.example/', 'tok')).toBe('https://club.example/unsubscribe/tok')
  })
})

const contact = (id: number, email: string | null, over: Partial<Contact> = {}): Contact => ({ id, email, firstName: `F${id}`, doNotEmail: false, erased: false, ...over })
const cand = (id: number, email: string | null, over: Partial<Candidate> = {}): Candidate => ({ ...contact(id, email), junior: false, guardians: [], ...over })

describe('audience', () => {
  it('drops free text and unknown values; defaults to current members', () => {
    const spec = parseAudience({ q: 'jane@example.com', status: 'weird', role: 'player', juniors: 'on', segment: 'owes-fees', extra: 'x' })
    expect(spec).toEqual({ status: 'active', role: 'player', juniors: true, segment: 'owes-fees' })
    expect(parseAudience({ role: 'not-a-role', segment: 'evil' })).toEqual(DEFAULT_AUDIENCE)
    expect(parseAudience(null)).toEqual(DEFAULT_AUDIENCE)
    expect(parseAudience({ status: 'any' }).status).toBeNull()
  })
  it('the saved JSON holds only enumerated words and a flag', () => {
    const json = audienceJson(parseAudience({ q: 'jane doe', email: 'a@b.co', status: 'past', role: 'coach' }))
    expect(json).toEqual({ status: 'past', role: 'coach', juniors: false, segment: 'none' })
    expect(JSON.stringify(json)).not.toMatch(/@|jane/)
    expect(parseAudience(json)).toEqual({ status: 'past', role: 'coach', juniors: false, segment: null })
  })
  it('removes do-not-email, erased and unsubscribed people, and counts each reason', () => {
    const r = resolveAudience(
      [cand(1, 'a@x.co'), cand(2, 'b@x.co', { doNotEmail: true }), cand(3, 'c@x.co', { erased: true }), cand(4, 'd@x.co'), cand(5, null)],
      (e) => e === 'd@x.co',
      100,
    )
    expect(r.recipients.map((x) => x.email)).toEqual(['a@x.co'])
    expect(r.counts).toMatchObject({ match: 5, willReceive: 1, noEmail: 2, doNotEmail: 1, unsubscribed: 1 })
  })
  it('sends a junior without an own address to the guardians who have one', () => {
    const r = resolveAudience([cand(1, null, { junior: true, guardians: [contact(10, 'p@x.co'), contact(11, null), contact(12, 'q@x.co', { doNotEmail: true })] })], () => false, 100)
    expect(r.recipients).toEqual([{ memberId: 10, email: 'p@x.co', firstName: 'F10' }])
    expect(r.counts.viaGuardian).toBe(1)
    const none = resolveAudience([cand(1, null, { junior: true, guardians: [contact(11, null)] })], () => false, 100)
    expect(none.counts).toMatchObject({ noEmail: 1, viaGuardian: 0 })
  })
  it('does not send a junior with their own address to a guardian too, and ignores guardians for an adult', () => {
    const r = resolveAudience([cand(1, 'kid@x.co', { junior: true, guardians: [contact(10, 'p@x.co')] }), cand(2, null, { guardians: [contact(10, 'p@x.co')] })], () => false, 100)
    expect(r.recipients.map((x) => x.email)).toEqual(['kid@x.co'])
    expect(r.counts.noEmail).toBe(1)
  })
  it('deduplicates addresses regardless of case', () => {
    const r = resolveAudience([cand(1, 'Same@x.co'), cand(2, 'same@X.co'), cand(3, null, { junior: true, guardians: [contact(9, 'SAME@x.co')] })], () => false, 100)
    expect(r.recipients).toHaveLength(1)
    expect(r.counts.duplicates).toBe(2)
  })
  it('a guardian whose address is unsubscribed counts the junior as unsubscribed', () => {
    const r = resolveAudience([cand(1, null, { junior: true, guardians: [contact(10, 'p@x.co')] })], (e) => e === 'p@x.co', 100)
    expect(r.counts).toMatchObject({ unsubscribed: 1, willReceive: 0, viaGuardian: 0 })
  })
  it('flags more addresses than the cap', () => {
    const many = Array.from({ length: 5 }, (_, i) => cand(i + 1, `u${i}@x.co`))
    expect(resolveAudience(many, () => false, 5).overCap).toBe(false)
    expect(resolveAudience(many, () => false, 4).overCap).toBe(true)
  })
  it('states the preview in one sentence', () => {
    const s = previewSentence({ match: 412, willReceive: 380, noEmail: 20, unsubscribed: 12, doNotEmail: 0, viaGuardian: 4, duplicates: 0 })
    expect(s).toBe('412 match; 380 will receive this; 20 have no email; 12 unsubscribed; 4 juniors go to a guardian')
  })
})

describe('backoff', () => {
  const now = new Date('2026-01-01T00:00:00Z')
  it('waits 2 then 10 minutes (double for rate limits) and then gives up', () => {
    expect(nextEmailAttempt(now, 1, 'transient')?.getTime()).toBe(now.getTime() + EMAIL_BACKOFF_MINUTES[0] * 60_000)
    expect(nextEmailAttempt(now, 2, 'transient')?.getTime()).toBe(now.getTime() + EMAIL_BACKOFF_MINUTES[1] * 60_000)
    expect(nextEmailAttempt(now, 1, 'rate')?.getTime()).toBe(now.getTime() + 2 * EMAIL_BACKOFF_MINUTES[0] * 60_000)
    expect(nextEmailAttempt(now, EMAIL_MAX_ATTEMPTS, 'transient')).toBeNull()
    expect(nextEmailAttempt(now, 0, 'transient')).toBeNull()
  })
})

describe('environment gate', () => {
  const FROM = { EMAIL_FROM_ADDRESS: 'club@example.org' }
  it('is on only with a provider, a from address and (for resend) a key', () => {
    expect(emailEnabled({})).toBe(false)
    expect(emailEnabled({ EMAIL_PROVIDER: 'mock' })).toBe(false)
    expect(emailEnabled({ ...FROM })).toBe(false)
    expect(emailEnabled({ ...FROM, EMAIL_PROVIDER: 'mock' })).toBe(true)
    expect(emailEnabled({ ...FROM, EMAIL_PROVIDER: 'resend' })).toBe(false)
    expect(emailEnabled({ ...FROM, EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'k' })).toBe(true)
    expect(emailEnabled({ ...FROM, EMAIL_PROVIDER: 'smtp', RESEND_API_KEY: 'k' })).toBe(false)
    expect(emailEnabled({ EMAIL_PROVIDER: 'mock', EMAIL_FROM_ADDRESS: 'not an address' })).toBe(false)
    expect(emailProvider({ EMAIL_PROVIDER: ' MOCK ' })).toBe('mock')
  })
  it('reads limits with safe defaults', () => {
    expect(emailLimits({})).toEqual({ batchSize: 50, ratePerSecond: 2, maxRecipients: 2000 })
    expect(emailLimits({ EMAIL_BATCH_SIZE: '10', EMAIL_RATE_PER_SECOND: '5', EMAIL_MAX_RECIPIENTS: '100' })).toEqual({ batchSize: 10, ratePerSecond: 5, maxRecipients: 100 })
    expect(emailLimits({ EMAIL_BATCH_SIZE: '-3', EMAIL_RATE_PER_SECOND: 'x' })).toMatchObject({ batchSize: 50, ratePerSecond: 2 })
  })
  it('takes the sender from env, then the club, and never from a literal', () => {
    expect(senderIdentity({ name: 'Club A', email: 'hello@a.example' }, FROM)).toEqual({ name: 'Club A', address: 'club@example.org', replyTo: 'hello@a.example' })
    expect(senderIdentity({ name: 'Club A', email: 'hello@a.example' }, { ...FROM, EMAIL_FROM_NAME: 'Other "<x>"', EMAIL_REPLY_TO: 'r@a.example' })).toEqual({ name: 'Other x', address: 'club@example.org', replyTo: 'r@a.example' })
    expect(senderIdentity({ name: 'Club A', email: 'hello@a.example' }, {})).toBeNull()
  })
  it('the mock provider is refused on a Vercel deployment, not elsewhere', () => {
    const deployed = { VERCEL: '1', VERCEL_ENV: 'production', VERCEL_URL: 'site.vercel.app', DATABASE_URI: 'postgres://u:p@127.0.0.1:5432/x' }
    expect(() => assertSafeEnv({ ...deployed, EMAIL_PROVIDER: 'mock' })).toThrow(/EMAIL_PROVIDER=mock/)
    expect(() => assertSafeEnv({ ...deployed, EMAIL_PROVIDER: 'resend' })).not.toThrow()
    expect(() => assertSafeEnv({ DATABASE_URI: 'postgres://u:p@127.0.0.1:5432/x', EMAIL_PROVIDER: 'mock' })).not.toThrow()
  })
  it('has no Payload adapter when mail is off', () => {
    expect(emailAdapterForPayload({})).toBeUndefined()
    expect(typeof emailAdapterForPayload({ ...FROM, EMAIL_PROVIDER: 'mock' })).toBe('function')
  })
})

describe('adapters', () => {
  const message = { to: 'a@b.co', from: { name: 'Club', address: 'c@d.co' }, subject: 'S', html: '<p>x</p>', text: 'x', idempotencyKey: 'k1', headers: { 'List-Unsubscribe': '<https://x>' } }
  it('classifies HTTP statuses', () => {
    expect(classifyStatus(429)).toBe('rate')
    expect(classifyStatus(401)).toBe('auth')
    expect(classifyStatus(403)).toBe('auth')
    expect(classifyStatus(500)).toBe('transient')
    expect(classifyStatus(422)).toBe('permanent')
  })
  it('posts to Resend with the key, the idempotency key and the unsubscribe headers (no real call)', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: 'r_1' }), { status: 200 }))
    const out = await createResendAdapter('secret-key', fetchImpl as unknown as typeof fetch).send(message)
    expect(out).toEqual({ ok: true, providerId: 'r_1' })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('k1')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret-key')
    expect(JSON.parse(String(init.body))).toMatchObject({ to: ['a@b.co'], headers: { 'List-Unsubscribe': '<https://x>' } })
  })
  it('maps failures to kinds, including a thrown network error', async () => {
    const make = (status: number) => createResendAdapter('k', (async () => new Response(JSON.stringify({ message: 'nope' }), { status })) as unknown as typeof fetch)
    expect(await make(429).send(message)).toMatchObject({ ok: false, kind: 'rate' })
    expect(await make(401).send(message)).toMatchObject({ ok: false, kind: 'auth' })
    expect(await make(503).send(message)).toMatchObject({ ok: false, kind: 'transient' })
    expect(await make(422).send(message)).toMatchObject({ ok: false, kind: 'permanent', message: 'nope' })
    const down = createResendAdapter('k', (async () => { throw new Error('boom') }) as unknown as typeof fetch)
    expect(await down.send(message)).toMatchObject({ ok: false, kind: 'transient' })
  })
  it('the mock records, scripts failures, and repeats the first answer for a repeated idempotency key', async () => {
    mockMail.reset()
    mockMail.failNext('transient')
    expect(await mockAdapter.send(message)).toMatchObject({ ok: false, kind: 'transient' })
    const a = await mockAdapter.send(message)
    const b = await mockAdapter.send(message)
    expect(a).toEqual(b)
    expect(mockMail.sent()).toHaveLength(1)
    expect(mockMail.calls()).toBe(3)
    mockMail.reset()
  })
})

describe('rendering', () => {
  const theme = resolveTheme(null)
  const brand = brandFromTheme(theme)
  it('builds a campaign with the sender wording, an unsubscribe link and a plain-text part', () => {
    const footer = footerLines({ template: 'You get this from {clubName}. Contact: {contact}', unsubscribeText: 'Stop any time.', complianceText: '', clubName: 'Test Club', contact: 'hi@club.example' })
    expect(footer).toEqual(['You get this from Test Club. Contact: hi@club.example', 'Stop any time.'])
    const m = renderCampaign({ subject: 'Hello {firstName|there}', body: 'Hi {firstName}\n\nBye', ctx, brand, footer, unsubscribeUrl: 'https://club.example/unsubscribe/tok' })
    expect(m.subject).toBe('Hello Sam')
    expect(m.html).toContain('href="https://club.example/unsubscribe/tok"')
    expect(m.html).toContain('Test Club')
    expect(m.text).toContain('Unsubscribe: https://club.example/unsubscribe/tok')
    expect(m.text).toContain('Contact: hi@club.example')
    expect(m.html).toContain(brand.band)
  })
  it('a transactional message has no unsubscribe link and no footer', () => {
    const m = renderTransactional({ clubName: 'Test Club', brand, paragraphs: ['Choose a password.'], action: { label: 'Go', url: 'https://club.example/admin/reset/t' } })
    expect(m.html).not.toMatch(/unsubscribe/i)
    expect(m.text).toContain('https://club.example/admin/reset/t')
  })
  it('the reset marker round-trips', () => {
    expect(RESET_MARKER.exec(resetMarker('https://club.example/admin/reset/abc'))?.[1]).toBe('https://club.example/admin/reset/abc')
  })
})
