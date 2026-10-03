/**
 * Story content conversion (spec §5). Server-only (jsdom, Payload) — deliberately without the
 * `server-only` marker, because the ETL (`payload run`) imports it too.
 *
 * Public write path:   Tiptap JSON → tiptapJsonToSafeHtml → normaliseStoryHtml → htmlToLexical
 *                      → resolveUploadNodes → payload.create/update
 * Token-edit load:     Lexical (depth 1) → lexicalToTiptapHtml → Tiptap `content`
 * ETL:                 legacy contentHtml → normaliseStoryHtml → htmlToLexical → resolveUploadNodes
 *
 * The ProseMirror schema stays the first sanitiser (raw `contentJson` is never trusted); the
 * JSDOM pass then maps everything onto the restricted Lexical feature set (storyLexical.ts).
 */
import { head } from '@vercel/blob'
import { convertHTMLToLexical, editorConfigFactory } from '@payloadcms/richtext-lexical'
import { convertLexicalToHTML } from '@payloadcms/richtext-lexical/html'
import type { JSONContent } from '@tiptap/core'
import { JSDOM } from 'jsdom'
import type { Payload, SanitizedConfig, Where } from 'payload'
import type { Story as StoryDoc } from '@/payload-types'
import { storyFeatures } from '@/payload/editor/storyLexical'
import { blobToken } from '@/payload/env'
import { blobPathParts, blobStoreId, isOwnBlobUrl } from './blob-url'
import { renderStoryHtml } from './stories-content'
import { isSafeHref } from './story-href'

export { isSafeHref }

/** Serialized Lexical editor state as stored in `stories.content`. */
export type StoryContent = StoryDoc['content']
type LexicalData = Parameters<typeof convertLexicalToHTML>[0]['data']

/** The folder the public story upload route writes to (spec §7.2). */
export const STORY_PENDING_PREFIX = 'stories/pending'

export const FOREIGN_IMAGE_ERROR = 'Images must be uploaded through the form.'

/** Thrown by `resolveUploadNodes` in public mode for an image it may not link or register. */
export class StoryImageError extends Error {
  constructor(public readonly src: string) {
    super(FOREIGN_IMAGE_ERROR)
    this.name = 'StoryImageError'
  }
}

// ---------------------------------------------------------------------------------------------
// 1. Tiptap JSON → HTML (ProseMirror schema = sanitiser)

const UNREADABLE = { error: 'The story body could not be read. Please try again.' }

/** Never throws: malformed JSON or an unknown node type returns `{ error }` instead of a 500. */
export function tiptapJsonToSafeHtml(raw: unknown): { html: string } | { error: string } {
  let doc: unknown = raw
  if (typeof raw === 'string') {
    try {
      doc = JSON.parse(raw)
    } catch {
      return UNREADABLE
    }
  }
  if (!doc || typeof doc !== 'object' || (doc as { type?: unknown }).type !== 'doc') return UNREADABLE
  try {
    return { html: renderStoryHtml(doc as JSONContent) }
  } catch {
    return UNREADABLE
  }
}

// ---------------------------------------------------------------------------------------------
// 2. HTML normalisation onto the Lexical feature set

const BLOB_HOST_SUFFIX = '.public.blob.vercel-storage.com'
export const MEDIA_FILE_PATH = '/api/media/file/'

/**
 * Image sources a story may carry into conversion: a Vercel Blob URL (this store's when the
 * store id is known, any store's otherwise — `resolveUploadNodes` is the real gate and only
 * links existing media or registers this store's pending uploads), a local Payload media file
 * URL, or a static `/assets/` path.
 */
export function isStoryImageSrc(src: string, storeId: string | null): boolean {
  if (src.startsWith('/assets/') || src.startsWith(MEDIA_FILE_PATH)) return !src.includes('..')
  try {
    const u = new URL(src)
    // A local media file under the server URL (no Blob token: `http://<host>/api/media/file/…`).
    if ((u.protocol === 'http:' || u.protocol === 'https:') && u.pathname.startsWith(MEDIA_FILE_PATH)) return !src.includes('..')
    if (u.protocol !== 'https:') return false
    return storeId ? u.hostname === `${storeId.toLowerCase()}${BLOB_HOST_SUFFIX}` : u.hostname.endsWith(BLOB_HOST_SUFFIX)
  } catch {
    return false
  }
}

const KEEP_ATTRS = new Set(['href', 'src', 'alt'])

/**
 * JSDOM pass (spec §5 step 2):
 * - `h1` → `h2`, `h5`/`h6` → `h4`;
 * - `pre` → `p` containing a `code` element;
 * - drops `img`s whose `src` is not an allowed story image (returned in `droppedImages`, so
 *   a public save can refuse and the ETL can report);
 * - unwraps links whose `href` is not http(s)/mailto (the text stays);
 * - strips every attribute except `href`, `src` and `alt`.
 */
export function normaliseStoryHtml(html: string, opts: { storeId: string | null }): { html: string; droppedImages: string[] } {
  const dom = new JSDOM(`<!DOCTYPE html><body>${html}</body>`)
  const doc = dom.window.document
  const body = doc.body
  const droppedImages: string[] = []

  const rename = (el: Element, tag: string) => {
    const next = doc.createElement(tag)
    while (el.firstChild) next.appendChild(el.firstChild)
    el.replaceWith(next)
    return next
  }
  for (const el of Array.from(body.querySelectorAll('h1'))) rename(el, 'h2')
  for (const el of Array.from(body.querySelectorAll('h5, h6'))) rename(el, 'h4')
  for (const pre of Array.from(body.querySelectorAll('pre'))) {
    const p = doc.createElement('p')
    const code = doc.createElement('code')
    code.textContent = pre.textContent ?? ''
    p.appendChild(code)
    pre.replaceWith(p)
  }
  for (const img of Array.from(body.querySelectorAll('img'))) {
    const src = (img.getAttribute('src') ?? '').trim()
    if (!src || !isStoryImageSrc(src, opts.storeId)) {
      droppedImages.push(src)
      img.remove()
    }
  }
  for (const a of Array.from(body.querySelectorAll('a'))) {
    if (!isSafeHref(a.getAttribute('href'))) a.replaceWith(...Array.from(a.childNodes))
  }
  for (const el of Array.from(body.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) if (!KEEP_ATTRS.has(attr.name)) el.removeAttribute(attr.name)
  }
  const out = body.innerHTML
  dom.window.close()
  return { html: out, droppedImages }
}

/** `src → alt` of every image in (normalised) HTML: the Lexical import keeps only the src. */
export function imageAlts(html: string): Map<string, string> {
  const dom = new JSDOM(`<!DOCTYPE html><body>${html}</body>`)
  const alts = new Map<string, string>()
  for (const img of Array.from(dom.window.document.querySelectorAll('img'))) {
    const src = img.getAttribute('src')
    if (src && !alts.has(src)) alts.set(src, img.getAttribute('alt') ?? '')
  }
  dom.window.close()
  return alts
}

// ---------------------------------------------------------------------------------------------
// 3. HTML → Lexical

const editorConfigs = new WeakMap<SanitizedConfig, ReturnType<typeof editorConfigFactory.fromFeatures>>()

function storyEditorConfig(config: SanitizedConfig) {
  let cfg = editorConfigs.get(config)
  if (!cfg) {
    cfg = editorConfigFactory.fromFeatures({ config, features: storyFeatures })
    editorConfigs.set(config, cfg)
  }
  return cfg
}

export async function htmlToLexical(html: string, config: SanitizedConfig): Promise<StoryContent> {
  const editorConfig = await storyEditorConfig(config)
  return convertHTMLToLexical({ editorConfig, html, JSDOM }) as unknown as StoryContent
}

// ---------------------------------------------------------------------------------------------
// 4. Upload nodes → media docs

type LexicalNode = { type?: string; children?: LexicalNode[]; pending?: { src?: string }; relationTo?: string; value?: unknown; [k: string]: unknown }

function uploadNodes(node: LexicalNode, out: LexicalNode[] = []): LexicalNode[] {
  if (node.type === 'upload') out.push(node)
  for (const child of node.children ?? []) uploadNodes(child, out)
  return out
}

function removeNode(root: LexicalNode, target: LexicalNode): void {
  if (!root.children) return
  const i = root.children.indexOf(target)
  if (i >= 0) root.children.splice(i, 1)
  else for (const child of root.children) removeNode(child, target)
}

/** Where a src points, when it points at a media file: `{ prefix?, filename }`. */
export function mediaRefOf(src: string): { prefix: string | null; filename: string } | null {
  try {
    if (src.startsWith(MEDIA_FILE_PATH) || src.includes(MEDIA_FILE_PATH)) {
      const u = new URL(src, 'http://local')
      if (!u.pathname.startsWith(MEDIA_FILE_PATH)) return null
      const filename = decodeURIComponent(u.pathname.slice(MEDIA_FILE_PATH.length))
      if (!filename || filename.includes('/')) return null
      return { prefix: u.searchParams.get('prefix'), filename }
    }
    const u = new URL(src)
    if (u.protocol !== 'https:' || !u.hostname.endsWith(BLOB_HOST_SUFFIX)) return null
    const { prefix, filename } = blobPathParts(src)
    return filename ? { prefix, filename } : null
  } catch {
    return null
  }
}

/**
 * An existing `media` doc for `src`: by `legacyUrl` first (legacy images keep their old-style
 * names), then by `prefix` + `filename` parsed from a Blob or Payload media URL. Looked up
 * BEFORE any `isOwnBlobUrl` check (spec §6), so a token edit of a legacy story resolves its
 * images.
 */
export async function findMediaBySrc(payload: Payload, src: string): Promise<number | null> {
  const byLegacy = await payload.find({ collection: 'media', where: { legacyUrl: { equals: src } }, limit: 1, depth: 0, overrideAccess: true })
  if (byLegacy.docs[0]) return byLegacy.docs[0].id
  const ref = mediaRefOf(src)
  if (!ref) return null
  const where: Where =
    ref.prefix === null
      ? { filename: { equals: ref.filename } }
      : { and: [{ filename: { equals: ref.filename } }, ref.prefix === '' ? { or: [{ prefix: { equals: '' } }, { prefix: { exists: false } }] } : { prefix: { equals: ref.prefix } }] }
  const found = await payload.find({ collection: 'media', where, limit: 1, depth: 0, overrideAccess: true })
  return found.docs[0]?.id ?? null
}

export type ResolveUploadsOptions = {
  payload: Payload
  /**
   * Turns a src that matches no existing media into a media id (registering or uploading it),
   * or returns null when it may not. `alt` comes from the source HTML.
   */
  register: (src: string, alt: string) => Promise<number | null>
  /** `public`: an unresolvable image throws `StoryImageError`. `etl`: the node is dropped and `onDrop` called. */
  mode: 'public' | 'etl'
  alts?: Map<string, string>
  onDrop?: (src: string) => void
}

/**
 * Spec §5 step 4 (load-bearing): every `upload` node from the HTML import carries only
 * `pending.src`, and saving that fails ("invalid selection"). Each one becomes
 * `{ relationTo: 'media', value: id }`, or is rejected (public) / dropped (ETL). Mutates and
 * returns `state`. Afterwards no node may still be pending.
 */
export async function resolveUploadNodes(state: StoryContent, opts: ResolveUploadsOptions): Promise<StoryContent> {
  const root = (state as unknown as { root: LexicalNode }).root
  const cache = new Map<string, number | null>()
  for (const node of uploadNodes(root)) {
    if (node.relationTo && node.value != null && !node.pending) continue
    const src = (node.pending?.src ?? '').trim()
    let id = cache.get(src)
    if (id === undefined) {
      id = src ? await findMediaBySrc(opts.payload, src) : null
      if (id === null && src) id = await opts.register(src, opts.alts?.get(src) ?? '')
      cache.set(src, id)
    }
    if (id === null) {
      if (opts.mode === 'public') throw new StoryImageError(src)
      opts.onDrop?.(src)
      removeNode(root, node)
      continue
    }
    node.relationTo = 'media'
    node.value = id
    delete node.pending
  }
  if (uploadNodes(root).some((n) => n.pending || n.value == null)) {
    throw new Error('resolveUploadNodes: an upload node is still unresolved')
  }
  return state
}

/**
 * The public register path (spec §5 step 4, §7.4): only a blob in THIS store directly under
 * `stories/pending/` with a safe basename, which `head()` confirms is an image. Registered as
 * a `media` doc without moving bytes (no `url`, focal point 50/50). Returns null otherwise.
 */
export async function registerPendingStoryImage(payload: Payload, src: string, alt = ''): Promise<number | null> {
  const token = blobToken()
  const storeId = blobStoreId(token)
  if (!token || !storeId || !isOwnBlobUrl(src, { storeId, prefix: STORY_PENDING_PREFIX })) return null
  let meta: { contentType?: string; size: number }
  try {
    meta = await head(src, { token })
  } catch {
    return null
  }
  if (!meta.contentType?.startsWith('image/')) return null
  const { prefix, filename } = blobPathParts(src)
  const doc = await payload.create({
    collection: 'media',
    data: { filename, prefix, mimeType: meta.contentType, filesize: meta.size, focalX: 50, focalY: 50, alt },
    overrideAccess: true,
    depth: 0,
  })
  return doc.id
}

// ---------------------------------------------------------------------------------------------
// 5. Lexical → HTML for the Tiptap token editor

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

type UploadValue = { url?: string | null; alt?: string | null } | number | null | undefined

/**
 * Story content (fetched at `depth: 1`, so upload nodes are populated) → the HTML Tiptap loads
 * as `content`. Images become `<img src alt>`; links keep only a safe `href`. Tiptap's schema
 * parses (and sanitises) it again.
 */
export function lexicalToTiptapHtml(content: StoryContent | null | undefined): string {
  if (!content || typeof content !== 'object' || !('root' in content)) return ''
  return convertLexicalToHTML({
    data: content as unknown as LexicalData,
    disableContainer: true,
    disableIndent: true,
    disableTextAlign: true,
    converters: ({ defaultConverters }) => ({
      ...defaultConverters,
      upload: ({ node }) => {
        const value = (node as { value?: UploadValue }).value
        if (!value || typeof value !== 'object' || !value.url) return ''
        return `<img src="${escapeAttr(value.url)}" alt="${escapeAttr(value.alt ?? '')}">`
      },
    }),
  })
}

/** Plain text of a story body (whitespace-normalised), for verification and excerpts. */
export function storyPlainText(content: StoryContent | null | undefined): string {
  return lexicalToTiptapHtml(content)
    .replace(/<\/?(p|h[1-6]|li|ul|ol|blockquote|pre|hr|br|img)\b[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}
