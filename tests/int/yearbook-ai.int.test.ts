/**
 * yearbook-ai.int (W2 spec 6.5, 6.10 step 6): the draft endpoint with a mocked `ai` module (no real model is ever called),
 * 503 when unconfigured, admin only, the facts sent to the model leave out hidden players and personal fields, the atomic
 * daily counter, drafts are returned and never saved, the publish gate, and text-only public render.
 */
import type { Payload } from 'payload'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { claimDraft, draftDay } from '@/lib/ai/draft-counter'
import { playerTables } from '@/lib/players/db'
import { destroyTestPayload, getTestPayload, rest, tokenFor } from './helpers'
import { resetPlayers } from './players-helpers'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: <T,>(fn: T) => fn }))
const ai = vi.hoisted(() => ({ generateText: vi.fn() }))
vi.mock('ai', () => ({ generateText: ai.generateText }))

const ctx = { disableRevalidate: true }
let payload: Payload
let admin: string
let editor: string
const ENV_KEYS = ['AI_GATEWAY_API_KEY', 'AI_DAILY_DRAFT_LIMIT', 'YEARBOOK_AI_MODEL'] as const
const saved: Record<string, string | undefined> = {}

beforeAll(async () => {
  payload = await getTestPayload()
  admin = await tokenFor(payload, 'admin')
  editor = await tokenFor(payload, 'editor')
  for (const k of ENV_KEYS) saved[k] = process.env[k]
})
afterAll(async () => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
  await destroyTestPayload(payload)
})
beforeEach(async () => {
  await resetPlayers(payload)
  await payload.delete({ collection: 'yearbooks', where: { id: { exists: true } }, context: ctx, overrideAccess: true })
  for (const k of ENV_KEYS) delete process.env[k]
  ai.generateText.mockReset()
  ai.generateText.mockResolvedValue({ text: 'A fine season for the club.\n\nThe seconds shone.' })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

const stamp = () => new Date().toISOString()
async function book(over: Record<string, unknown> = {}) {
  return payload.create({ collection: 'yearbooks', data: { title: '2025/26 Yearbook', seasonName: 'Summer 2025/26', ...over } as never, context: ctx })
}
async function player(first: string, last: string, hidden: boolean, runs: number, extra: Record<string, unknown> = {}) {
  const t = playerTables(payload)
  const [p] = await payload.db.drizzle
    .insert(t.players)
    .values({ slug: `${first}-${last}`.toLowerCase(), firstName: first, lastName: last, displayName: `${first} ${last}`, source: 'playhq', hidden, bio: 'PRIVATE BIO TEXT', createdAt: stamp(), updatedAt: stamp(), ...extra })
    .returning({ id: t.players.id })
  await payload.db.drizzle.insert(t.player_seasons).values({
    player: p.id, seasonName: 'Summer 2025/26', seasonOrder: 1, teamId: 'T', teamName: 'Demo A', gradeName: 'Demo A Grade', games: 10, batInnings: 10, batRuns: runs, batHighScore: 80, createdAt: stamp(), updatedAt: stamp(),
  })
  return p.id as number
}

describe('draft endpoint', () => {
  it('is 503 with no AI key and makes no model call', async () => {
    const b = await book()
    const res = await rest('POST', `/yearbooks/${b.id}/draft-summary`, { token: admin })
    expect(res.status).toBe(503)
    expect(res.json.errors[0].message).toContain('not set up')
    expect(ai.generateText).not.toHaveBeenCalled()
  })

  it('is admin only', async () => {
    process.env.AI_GATEWAY_API_KEY = 'test-key-not-real'
    const b = await book()
    expect((await rest('POST', `/yearbooks/${b.id}/draft-summary`)).status).toBe(401)
    expect((await rest('POST', `/yearbooks/${b.id}/draft-summary`, { token: editor })).status).toBe(403)
    expect(ai.generateText).not.toHaveBeenCalled()
  })

  it('returns a draft without saving it, with the model, bounds, and only public facts in the prompt', async () => {
    process.env.AI_GATEWAY_API_KEY = 'test-key-not-real'
    process.env.YEARBOOK_AI_MODEL = 'anthropic/test-model'
    const visible = await player('Pat', 'Lee', false, 600)
    await payload.update({ collection: 'players', id: visible, data: { honours: [{ years: '2025/26', title: 'Club champion' }] }, context: ctx })
    await player('Secret', 'Hidden', true, 900)
    const b = await book({ premiership: 'A Grade premiers' })
    const res = await rest('POST', `/yearbooks/${b.id}/draft-summary`, { token: admin })
    expect(res.status).toBe(200)
    expect(res.json).toEqual({ text: 'A fine season for the club.\n\nThe seconds shone.', aiAssisted: true })
    const call = ai.generateText.mock.calls[0][0]
    expect(call.model).toBe('anthropic/test-model')
    expect(call.maxOutputTokens).toBe(600)
    expect(call.abortSignal).toBeInstanceOf(AbortSignal)
    expect(call.prompt).toContain('Pat Lee')
    expect(call.prompt).toContain('Club champion')
    expect(call.prompt).toContain('A Grade premiers')
    for (const banned of ['Secret', 'Hidden', 'PRIVATE BIO', '@']) expect(`${call.system}\n${call.prompt}`).not.toContain(banned)
    // Nothing was saved.
    const stored = await payload.findByID({ collection: 'yearbooks', id: b.id, depth: 0 })
    expect(stored.seasonSummary).toBe('')
    expect(stored.seasonSummaryAi).toBe(false)
  })

  it('a failed model call is 502 and does not use up a daily draft', async () => {
    process.env.AI_GATEWAY_API_KEY = 'test-key-not-real'
    process.env.AI_DAILY_DRAFT_LIMIT = '1'
    ai.generateText.mockRejectedValueOnce(new Error('gateway down'))
    const b = await book()
    expect((await rest('POST', `/yearbooks/${b.id}/draft-summary`, { token: admin })).status).toBe(502)
    expect((await rest('POST', `/yearbooks/${b.id}/draft-summary`, { token: admin })).status).toBe(200)
    // The one draft is now used.
    const over = await rest('POST', `/yearbooks/${b.id}/draft-summary`, { token: admin })
    expect(over.status).toBe(429)
    expect(over.json.errors[0].message).toContain('limit')
  })

  it('an unknown yearbook is 404', async () => {
    process.env.AI_GATEWAY_API_KEY = 'test-key-not-real'
    expect((await rest('POST', '/yearbooks/999999/draft-summary', { token: admin })).status).toBe(404)
  })
})

describe('daily counter', () => {
  it('two concurrent calls at limit minus one admit exactly one', async () => {
    expect(await claimDraft(payload, 3)).toBe(true)
    expect(await claimDraft(payload, 3)).toBe(true)
    const results = await Promise.all([claimDraft(payload, 3), claimDraft(payload, 3)])
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(await claimDraft(payload, 3)).toBe(false)
    const rows = await payload.db.drizzle.execute((await import('@payloadcms/db-postgres/drizzle')).sql.raw('SELECT day, count FROM "payload"."ai_draft_counter"'))
    expect(rows.rows.map((r) => ({ day: r.day, count: Number(r.count) }))).toEqual([{ day: draftDay(), count: 3 }])
  })

  it('a new day starts a fresh row', async () => {
    const day1 = new Date('2026-10-04T03:00:00Z')
    const day2 = new Date('2026-10-05T03:00:00Z')
    expect(await claimDraft(payload, 1, day1)).toBe(true)
    expect(await claimDraft(payload, 1, day1)).toBe(false)
    expect(await claimDraft(payload, 1, day2)).toBe(true)
  })
})

describe('publish gate and flags', () => {
  it('refuses to publish an AI-flagged summary until ticked, and records who ticked', async () => {
    const adminUser = (await payload.find({ collection: 'users', where: { email: { equals: 'admin@example.com' } }, limit: 1 })).docs[0]
    const b = await book({ seasonSummary: 'A draft.', seasonSummaryAi: true })
    await expect(payload.update({ collection: 'yearbooks', id: b.id, data: { status: 'published' }, context: ctx })).rejects.toThrow(/drafted with AI/)
    const ok = await payload.update({ collection: 'yearbooks', id: b.id, data: { status: 'published', seasonSummaryChecked: true }, context: ctx, user: { ...adminUser, collection: 'users' }, overrideAccess: false })
    expect(ok).toMatchObject({ status: 'published', seasonSummaryAi: true, seasonSummaryChecked: true })
    const reloaded = await payload.findByID({ collection: 'yearbooks', id: b.id, depth: 0 })
    expect(reloaded.seasonSummaryCheckedBy).toBe(adminUser.id)
    // Editing the text un-ticks it, which blocks the next publish-state save.
    await expect(payload.update({ collection: 'yearbooks', id: b.id, data: { seasonSummary: 'A different text.' }, context: ctx })).rejects.toThrow(/drafted with AI/)
  })

  it('discarding the draft (empty summary) clears the flag and never blocks', async () => {
    const b = await book({ seasonSummary: 'A draft.', seasonSummaryAi: true })
    const cleared = await payload.update({ collection: 'yearbooks', id: b.id, data: { seasonSummary: '', status: 'published' }, context: ctx })
    expect(cleared).toMatchObject({ seasonSummary: '', seasonSummaryAi: false, seasonSummaryChecked: false, status: 'published' })
  })

  it('an editor cannot set the AI flag over REST; it stays what the admin set', async () => {
    const b = await book({ seasonSummary: 'Hand written.' })
    const res = await rest('PATCH', `/yearbooks/${b.id}`, { token: editor, body: { seasonSummaryAi: true, seasonSummary: 'Hand written again.' } })
    expect(res.status).toBe(200)
    expect((await payload.findByID({ collection: 'yearbooks', id: b.id, depth: 0 })).seasonSummaryAi).toBe(false)
    // And an editor can publish a hand-written summary.
    expect((await rest('PATCH', `/yearbooks/${b.id}`, { token: editor, body: { status: 'published' } })).status).toBe(200)
  })

  it('renders the summary as text with the AI note only when flagged', async () => {
    const { YearbookSummary } = await import('@/components/stats/yearbook-sections')
    const html = renderToStaticMarkup(YearbookSummary({ text: 'First.\n\n<script>alert(1)</script>', aiNote: 'Written with AI assistance' }) as never)
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).toContain('Written with AI assistance')
    expect(renderToStaticMarkup(YearbookSummary({ text: 'Plain.', aiNote: null }) as never)).not.toContain('AI assistance')
    const b = await book({ seasonSummary: 'A draft.', seasonSummaryAi: true, seasonSummaryChecked: true, status: 'published' })
    const { getPublishedYearbookBySlug } = await import('@/lib/yearbooks-queries')
    expect(await getPublishedYearbookBySlug(b.slug!)).toMatchObject({ seasonSummary: 'A draft.', seasonSummaryAi: true })
  })
})
