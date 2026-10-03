import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SanitizedConfig } from 'payload'
import { createPayloadFake, type PayloadFake } from './helpers/payload-fake'
import { loadSanitizedConfig } from './helpers/sanitized-config'

/**
 * spec §15 ADAPT: the public story actions on the payload fake (the collection hooks — slug,
 * tokens, the public-edit rule — are covered against real Postgres in stories.int).
 */
let fake: PayloadFake
let config: SanitizedConfig
const jar = new Map<string, string>()
const head = vi.fn(async (url: string, _opts?: unknown) => ({ url, size: 1234, contentType: 'image/jpeg' }))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;${to}` })
  },
}))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (jar.has(n) ? { value: jar.get(n) } : undefined), set: (n: string, v: string) => jar.set(n, v) }),
}))
vi.mock('@vercel/blob', () => ({ head: (url: string, opts?: unknown) => head(url, opts) }))
vi.mock('@/lib/payload/client', () => ({ getPayloadClient: async () => fake }))

const prevFake = process.env.PAYLOAD_BLOB_FAKE
process.env.PAYLOAD_BLOB_FAKE = '1'
afterAll(() => {
  if (prevFake === undefined) delete process.env.PAYLOAD_BLOB_FAKE
  else process.env.PAYLOAD_BLOB_FAKE = prevFake
})

beforeAll(async () => {
  config = await loadSanitizedConfig()
}, 60_000)

const STORE = 'https://fakestore.public.blob.vercel-storage.com'
const EDIT = '11111111-2222-3333-4444-555555555555'

function setup() {
  fake = createPayloadFake({
    stories: [{ id: 1, slug: 'live', title: 'Live', status: 'published', editToken: EDIT, viewToken: 'v'.repeat(36) }],
    media: [{ id: 50, filename: 'old-cover.jpg', prefix: 'stories', legacyUrl: `${STORE}/stories/old-cover.jpg` }],
  })
  Object.assign(fake, { config })
  // The real collection hooks generate the tokens; the fake stands in for them.
  const create = fake.create
  fake.create = (async (args: { collection: string; data: Record<string, unknown> }) => {
    const doc = await create(args)
    return args.collection === 'stories' ? { ...doc, editToken: 'e'.repeat(36), viewToken: 'w'.repeat(36) } : doc
  }) as typeof fake.create
}

beforeEach(() => {
  jar.clear()
  head.mockClear()
  setup()
})

const doc = (...content: unknown[]) => JSON.stringify({ type: 'doc', content })
const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const img = (src: string) => ({ type: 'image', attrs: { src, alt: 'pic', title: null } })

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

const storyCreates = () => fake.callsTo('create', 'stories') as unknown as { args: { data: Record<string, unknown>; context?: Record<string, unknown>; overrideAccess?: boolean } }[]

type LexNode = { type: string; children?: LexNode[]; value?: unknown; relationTo?: string }
const uploadValues = (content: unknown) => {
  const out: unknown[] = []
  const walk = (n: LexNode) => {
    if (n.type === 'upload') out.push(n.value)
    n.children?.forEach(walk)
  }
  walk((content as { root: LexNode }).root)
  return out
}

describe('submitStory', () => {
  it('creates a pending public submission through the pipeline and remembers the links in the cookie', async () => {
    const { submitStory } = await import('@/app/(frontend)/history/submit/actions')
    await expect(submitStory(formData({ authorName: 'Pat Smith', title: 'My First Season', authorEmail: 'pat@example.com', contentJson: doc(p('My first season with the seniors.')) }))).rejects.toThrow('NEXT_REDIRECT')
    const [call] = storyCreates()
    expect(call.args.overrideAccess).toBe(true)
    expect(call.args.context).toMatchObject({ publicSubmission: true })
    expect(Object.keys(call.args.data).sort()).toEqual(['authorEmail', 'authorName', 'content', 'coverImage', 'excerpt', 'status', 'title'])
    expect(call.args.data).toMatchObject({ title: 'My First Season', authorName: 'Pat Smith', status: 'pending', excerpt: 'My first season with the seniors.', coverImage: null })
    expect(JSON.parse(jar.get('llcc_story_draft')!)).toEqual({ title: 'My First Season', editToken: 'e'.repeat(36), viewToken: 'w'.repeat(36) })
  })

  it('rejects missing required fields, an empty body and malformed JSON without writing', async () => {
    const { submitStory } = await import('@/app/(frontend)/history/submit/actions')
    expect(await submitStory(formData({ authorName: '', title: '', contentJson: doc(p('x')) }))).toEqual({ error: 'Name, title and story body are required.' })
    expect(await submitStory(formData({ authorName: 'Pat', title: 'Empty', contentJson: doc({ type: 'paragraph' }) }))).toEqual({ error: 'Story body cannot be empty.' })
    expect(await submitStory(formData({ authorName: 'Pat', title: 'Bad', contentJson: '{nope' }))).toHaveProperty('error')
    expect(await submitStory(formData({ authorName: 'Pat', title: 'Bad email', authorEmail: 'nope', contentJson: doc(p('x')) }))).toEqual({ error: 'Enter a valid email address, or leave it empty.' })
    expect(storyCreates()).toHaveLength(0)
  })

  it('silently no-ops when the honeypot field is filled in', async () => {
    const { submitStory } = await import('@/app/(frontend)/history/submit/actions')
    await expect(submitStory(formData({ authorName: 'Bot', title: 'Buy now', contentJson: doc(p('spam')), website: 'http://spam.example' }))).rejects.toThrow('NEXT_REDIRECT')
    expect(storyCreates()).toHaveLength(0)
  })

  it('rejects a foreign inline image', async () => {
    const { submitStory } = await import('@/app/(frontend)/history/submit/actions')
    for (const src of ['https://evil.example/x.jpg', 'https://otherstore.public.blob.vercel-storage.com/stories/pending/x.jpg', `${STORE}/stories/other/x.jpg`]) {
      const res = await submitStory(formData({ authorName: 'Pat', title: 'T', contentJson: doc(p('Text'), img(src)) }))
      expect(res).toEqual({ error: 'Images must be uploaded through the form.' })
    }
    expect(storyCreates()).toHaveLength(0)
  })

  it('registers a pending own-store image (no url, focal 50/50) and links the upload node; a valid pending cover too', async () => {
    const { submitStory } = await import('@/app/(frontend)/history/submit/actions')
    const src = `${STORE}/stories/pending/team-AbC123.jpg`
    const cover = `${STORE}/stories/pending/cover-XyZ9.jpg`
    await expect(submitStory(formData({ authorName: 'Pat', title: 'T', coverImageUrl: cover, contentJson: doc(p('Text'), img(src)) }))).rejects.toThrow('NEXT_REDIRECT')
    const media = fake.callsTo('create', 'media').map((c) => (c.args as { data: Record<string, unknown> }).data)
    expect(media).toEqual([
      { filename: 'team-AbC123.jpg', prefix: 'stories/pending', mimeType: 'image/jpeg', filesize: 1234, focalX: 50, focalY: 50, alt: 'pic' },
      { filename: 'cover-XyZ9.jpg', prefix: 'stories/pending', mimeType: 'image/jpeg', filesize: 1234, focalX: 50, focalY: 50, alt: '' },
    ])
    const ids = fake.store.media.map((m) => m.id)
    const data = storyCreates()[0].args.data
    expect(uploadValues(data.content)).toEqual([ids[1]])
    expect(data.coverImage).toBe(ids[2])
  })

  it('ignores a cover URL outside stories/pending/ (as before), but keeps an existing media cover', async () => {
    const { submitStory } = await import('@/app/(frontend)/history/submit/actions')
    await expect(submitStory(formData({ authorName: 'Pat', title: 'A', coverImageUrl: 'https://evil.example/c.jpg', contentJson: doc(p('x')) }))).rejects.toThrow('NEXT_REDIRECT')
    await expect(submitStory(formData({ authorName: 'Pat', title: 'B', coverImageUrl: `${STORE}/stories/old-cover.jpg`, contentJson: doc(p('x')) }))).rejects.toThrow('NEXT_REDIRECT')
    expect(storyCreates().map((c) => c.args.data.coverImage)).toEqual([null, 50])
  })
})

describe('updateDraftByToken', () => {
  it('refuses a malformed or unknown token without writing', async () => {
    const { updateDraftByToken } = await import('@/app/(frontend)/history/drafts/[token]/edit/actions')
    const fd = formData({ authorName: 'Pat', title: 'T', contentJson: doc(p('x')) })
    expect(await updateDraftByToken('', fd)).toEqual({ error: 'This edit link is no longer valid.' })
    expect(await updateDraftByToken('99999999-2222-3333-4444-555555555555', fd)).toEqual({ error: 'This edit link is no longer valid.' })
    expect(fake.callsTo('update')).toHaveLength(0)
  })

  it('updates by id with allowlisted data and context.publicSubmission, whatever else the form carries', async () => {
    const { updateDraftByToken } = await import('@/app/(frontend)/history/drafts/[token]/edit/actions')
    const res = await updateDraftByToken(
      EDIT,
      formData({ authorName: 'Pat', title: 'Edited', contentJson: doc(p('New text')), status: 'published', editToken: 'x'.repeat(36), slug: 'hijack', publishedAt: '2000-01-01' }),
    )
    expect(res).toBeUndefined()
    const lookups = fake.callsTo('find', 'stories')
    expect(lookups.at(-1)?.args).toMatchObject({ where: { editToken: { equals: EDIT } }, limit: 1 })
    const [update] = fake.callsTo('update', 'stories') as unknown as { args: { id: number; data: Record<string, unknown>; context: Record<string, unknown> } }[]
    expect(update.args.id).toBe(1)
    expect(update.args.context).toMatchObject({ publicSubmission: true })
    expect(Object.keys(update.args.data).sort()).toEqual(['authorEmail', 'authorName', 'content', 'coverImage', 'excerpt', 'title'])
  })

  // Cutover checklist B.4: on a preview the token is the preview store's, while a legacy
  // story's inline images live in the production store (`fakestore` here).
  it("on a preview keeps a legacy story's production-store image; in production that store is foreign", async () => {
    const { updateDraftByToken } = await import('@/app/(frontend)/history/drafts/[token]/edit/actions')
    const legacy = `${STORE}/stories/old-cover.jpg`
    const form = () => formData({ authorName: 'Pat', title: 'Edited', contentJson: doc(p('Text'), img(legacy)) })
    vi.stubEnv('VERCEL', '1')
    vi.stubEnv('VERCEL_URL', 'site-abc123.vercel.app')
    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://example.org')
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'vercel_blob_rw_previewstore_x')
    try {
      vi.stubEnv('VERCEL_ENV', 'production')
      expect(await updateDraftByToken(EDIT, form())).toEqual({ error: 'Images must be uploaded through the form.' })
      expect(fake.callsTo('update')).toHaveLength(0)

      vi.stubEnv('VERCEL_ENV', 'preview')
      expect(await updateDraftByToken(EDIT, form())).toBeUndefined()
      const [update] = fake.callsTo('update', 'stories') as unknown as { args: { data: Record<string, unknown> } }[]
      expect(uploadValues(update.args.data.content)).toEqual([50])
      expect(fake.callsTo('create', 'media')).toHaveLength(0)
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
