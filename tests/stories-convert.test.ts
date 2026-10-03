import { beforeAll, describe, expect, it } from 'vitest'
import type { SanitizedConfig } from 'payload'
import { renderStoryHtml } from '@/lib/stories-content'
import { htmlToExcerpt } from '@/lib/story-excerpt'
import {
  StoryImageError,
  htmlToLexical,
  imageAlts,
  lexicalToTiptapHtml,
  normaliseStoryHtml,
  resolveUploadNodes,
  storyPlainText,
  tiptapJsonToSafeHtml,
  type StoryContent,
} from '@/lib/stories-convert'
import { excerptFromContent } from '@/payload/hooks/storyLifecycle'
import { createPayloadFake } from './helpers/payload-fake'
import { loadSanitizedConfig } from './helpers/sanitized-config'

/** spec §5 / §15: the one module tested in both directions (replaces stories-content.test). */
let config: SanitizedConfig
beforeAll(async () => {
  config = await loadSanitizedConfig()
}, 60_000)

const STORE = 'https://fakestore.public.blob.vercel-storage.com'
const opts = { storeId: 'fakestore' }

type Node = { type: string; children?: Node[]; [k: string]: unknown }
const nodes = (state: StoryContent): Node[] => {
  const out: Node[] = []
  const walk = (n: Node) => {
    out.push(n)
    for (const c of n.children ?? []) walk(c)
  }
  walk((state as unknown as { root: Node }).root)
  return out
}

describe('tiptapJsonToSafeHtml (ProseMirror schema as sanitiser)', () => {
  it('renders headings, marks and images', () => {
    const r = tiptapJsonToSafeHtml({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Round 6' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'What a ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'win' }] },
        { type: 'image', attrs: { src: `${STORE}/stories/pending/a.jpg`, alt: null, title: null } },
      ],
    })
    expect('html' in r && r.html).toContain('<h2>Round 6</h2>')
    expect('html' in r && r.html).toContain('<strong>win</strong>')
  })

  it('strips unexpected attributes injected on a link mark', () => {
    const html = renderStoryHtml({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'click', marks: [{ type: 'link', attrs: { href: 'https://example.com', class: 'fixed inset-0', target: '_blank', rel: 'evil' } }] }] }],
    })
    expect(html).toContain('href="https://example.com"')
    expect(html).not.toMatch(/class=|target=|rel=/)
  })

  it('strips a javascript: href', () => {
    const html = renderStoryHtml({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'click', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }],
    })
    expect(html).not.toContain('javascript:')
  })

  it('returns { error } instead of throwing for malformed JSON or unknown nodes', () => {
    expect(tiptapJsonToSafeHtml('{not json')).toHaveProperty('error')
    expect(tiptapJsonToSafeHtml(JSON.stringify({ type: 'doc', content: [{ type: 'evil' }] }))).toHaveProperty('error')
    expect(tiptapJsonToSafeHtml(JSON.stringify({ type: 'paragraph' }))).toHaveProperty('error')
  })
})

describe('normaliseStoryHtml', () => {
  it('maps h1 → h2 and h5/h6 → h4, and pre → p > code', () => {
    const { html } = normaliseStoryHtml('<h1>A</h1><h5>B</h5><h6>C</h6><pre><code>x = 1</code></pre>', opts)
    expect(html).toBe('<h2>A</h2><h4>B</h4><h4>C</h4><p><code>x = 1</code></p>')
  })

  it('drops foreign images and reports them; keeps own-store, local media and /assets/ images', () => {
    const { html, droppedImages } = normaliseStoryHtml(
      `<img src="https://evil.example/x.png"><img src="https://otherstore.public.blob.vercel-storage.com/stories/pending/a.jpg">` +
        `<img src="${STORE}/stories/pending/b.jpg" alt="B"><img src="/assets/gallery/photo-01.jpg"><img src="http://localhost:3000/api/media/file/c.jpg">` +
        `<img src="data:image/png;base64,AAAA">`,
      opts,
    )
    expect(droppedImages).toEqual(['https://evil.example/x.png', 'https://otherstore.public.blob.vercel-storage.com/stories/pending/a.jpg', 'data:image/png;base64,AAAA'])
    expect(html).toContain(`${STORE}/stories/pending/b.jpg`)
    expect(html).toContain('/assets/gallery/photo-01.jpg')
    expect(html).toContain('/api/media/file/c.jpg')
  })

  it('strips every attribute except href, src and alt, and unwraps unsafe links', () => {
    const { html } = normaliseStoryHtml(
      '<p class="x" style="color:red" onclick="evil()">a <a href="https://ok.example" target="_blank" rel="x">ok</a> ' +
        '<a href="javascript:alert(1)">bad</a> <a>none</a> <a href="mailto:a@b.co">mail</a></p>',
      opts,
    )
    expect(html).toBe('<p>a <a href="https://ok.example">ok</a> bad none <a href="mailto:a@b.co">mail</a></p>')
  })
})

describe('htmlToLexical + resolveUploadNodes', () => {
  const html = `<h2>Hi</h2><p><strong>b</strong> <s>s</s> <code>c</code> <a href="https://x.example">l</a></p>` +
    `<img src="${STORE}/stories/premiership.jpg" alt="Team"><img src="${STORE}/stories/pending/new.jpg" alt="New">` +
    `<ul><li><p>one</p><ul><li><p>nested</p></li></ul></li></ul><blockquote><p>q</p></blockquote><hr>`

  it('links existing media by legacyUrl, registers new pending uploads, and leaves nothing pending', async () => {
    const fake = createPayloadFake({ media: [{ id: 7, filename: 'premiership.jpg', prefix: 'stories', legacyUrl: `${STORE}/stories/premiership.jpg` }] })
    const registered: [string, string][] = []
    const state = await htmlToLexical(html, config)
    await resolveUploadNodes(state, {
      payload: fake as never,
      mode: 'public',
      alts: imageAlts(html),
      register: async (src, alt) => {
        registered.push([src, alt])
        return 99
      },
    })
    const uploads = nodes(state).filter((n) => n.type === 'upload')
    expect(uploads.map((u) => [u.relationTo, u.value, 'pending' in u])).toEqual([
      ['media', 7, false],
      ['media', 99, false],
    ])
    expect(registered).toEqual([[`${STORE}/stories/pending/new.jpg`, 'New']])
    const types = nodes(state).map((n) => n.type)
    expect(types).toEqual(expect.arrayContaining(['heading', 'paragraph', 'link', 'list', 'listitem', 'quote', 'horizontalrule']))
  })

  it('public mode rejects an image it can neither find nor register', async () => {
    const fake = createPayloadFake({ media: [] })
    const state = await htmlToLexical(`<p>x</p><img src="${STORE}/stories/other.jpg">`, config)
    await expect(resolveUploadNodes(state, { payload: fake as never, mode: 'public', register: async () => null })).rejects.toBeInstanceOf(StoryImageError)
  })

  it('etl mode drops the node and reports it', async () => {
    const fake = createPayloadFake({ media: [] })
    const dropped: string[] = []
    const state = await htmlToLexical(`<p>x</p><img src="${STORE}/stories/gone.jpg">`, config)
    await resolveUploadNodes(state, { payload: fake as never, mode: 'etl', register: async () => null, onDrop: (s) => dropped.push(s) })
    expect(dropped).toEqual([`${STORE}/stories/gone.jpg`])
    expect(nodes(state).some((n) => n.type === 'upload')).toBe(false)
  })

  it('finds existing media by prefix + filename from a local media file URL', async () => {
    const fake = createPayloadFake({ media: [{ id: 3, filename: 'photo-02.jpg', prefix: '', legacyUrl: '/assets/gallery/photo-02.jpg' }] })
    const state = await htmlToLexical('<img src="http://localhost:3000/api/media/file/photo-02.jpg">', config)
    await resolveUploadNodes(state, { payload: fake as never, mode: 'public', register: async () => null })
    expect(nodes(state).find((n) => n.type === 'upload')?.value).toBe(3)
  })
})

describe('round trip: Tiptap → Lexical → HTML', () => {
  it('keeps formatting, links and images (populated at depth 1)', async () => {
    const json = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'It was ' },
            { type: 'text', marks: [{ type: 'bold' }], text: 'hot' },
            { type: 'text', text: ', see ' },
            { type: 'text', marks: [{ type: 'link', attrs: { href: 'https://example.com/h' } }], text: 'here' },
          ],
        },
        { type: 'image', attrs: { src: `${STORE}/stories/pending/a.jpg`, alt: 'A', title: null } },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }] }] },
      ],
    }
    const r = tiptapJsonToSafeHtml(JSON.stringify(json))
    if (!('html' in r)) throw new Error(r.error)
    const { html } = normaliseStoryHtml(r.html, opts)
    const state = await htmlToLexical(html, config)
    const fake = createPayloadFake({ media: [] })
    await resolveUploadNodes(state, { payload: fake as never, mode: 'public', register: async () => 5 })
    // depth 1: the upload value is the media doc
    for (const n of nodes(state)) if (n.type === 'upload') n.value = { id: 5, url: `${STORE}/stories/pending/a.jpg`, alt: 'A' }
    const back = lexicalToTiptapHtml(state)
    expect(back).toContain('<h2>Title</h2>')
    expect(back).toContain('<strong>hot</strong>')
    expect(back).toContain('<a href="https://example.com/h">here</a>')
    expect(back).toContain(`<img src="${STORE}/stories/pending/a.jpg" alt="A">`)
    expect(back).toMatch(/<ul[^>]*><li[^>]*>one<\/li><\/ul>/)
    expect(storyPlainText(state)).toBe('Title It was hot, see here one')
  })
})

describe('excerpts', () => {
  it('strips tags and collapses whitespace', () => {
    expect(htmlToExcerpt('<p>Hello   <strong>world</strong></p>')).toBe('Hello world')
    expect(htmlToExcerpt('<p></p>')).toBe('')
  })

  it('truncates at a word boundary with an ellipsis', () => {
    const excerpt = htmlToExcerpt('<p>' + 'word '.repeat(50) + '</p>', 20)
    expect(excerpt.length).toBeLessThanOrEqual(21)
    expect(excerpt.endsWith('…')).toBe(true)
  })

  it('derives from Lexical, rendering unpopulated upload nodes as nothing', async () => {
    const state = await htmlToLexical(`<p>First line.</p><img src="${STORE}/x.jpg"><p>Second.</p>`, config)
    for (const n of nodes(state)) if (n.type === 'upload') Object.assign(n, { relationTo: 'media', value: 1, pending: undefined })
    expect(excerptFromContent(state)).toBe('First line. Second.')
  })
})
