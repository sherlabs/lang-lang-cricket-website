/**
 * Merge tags for campaign text (wave D spec 9.3). Plain text with blank-line paragraphs. Allowed tags: `{firstName}`,
 * `{firstName|fallback}`, `{clubName}`, `{volunteerLink}`. Any other `{...}` fails validation with the tag named. Everything that is
 * substituted is escaped for the format it lands in, so a first name such as `<b>` can never inject markup.
 */
export type MergeContext = { firstName: string | null; clubName: string; volunteerLink: string | null }

export const KNOWN_TAGS = ['firstName', 'clubName', 'volunteerLink'] as const
const TAG_RE = /\{([^{}\n]*)\}/g
const FALLBACK_MAX = 40

type Segment = { kind: 'text'; value: string } | { kind: 'tag'; name: (typeof KNOWN_TAGS)[number]; fallback: string }

export type ParseResult = { ok: true; segments: Segment[] } | { ok: false; tag: string }

export function parseTemplate(text: string): ParseResult {
  const segments: Segment[] = []
  let last = 0
  for (const m of text.matchAll(TAG_RE)) {
    const raw = m[1].trim()
    const [name, ...rest] = raw.split('|')
    const fallback = rest.join('|')
    const known = (KNOWN_TAGS as readonly string[]).includes(name)
    const fallbackOk = fallback.length <= FALLBACK_MAX && !/[{}]/.test(fallback)
    if (!known || (rest.length > 0 && name !== 'firstName') || !fallbackOk) return { ok: false, tag: `{${raw.slice(0, 40)}}` }
    if (m.index > last) segments.push({ kind: 'text', value: text.slice(last, m.index) })
    segments.push({ kind: 'tag', name: name as (typeof KNOWN_TAGS)[number], fallback: fallback.trim() })
    last = m.index + m[0].length
  }
  if (last < text.length) segments.push({ kind: 'text', value: text.slice(last) })
  return { ok: true, segments }
}

/** Null when the text is fine, else a plain sentence naming the first bad tag. */
export function templateProblem(text: string): string | null {
  const r = parseTemplate(text)
  return r.ok ? null : `${r.tag} is not a tag we know. You can use {firstName}, {firstName|there}, {clubName} and {volunteerLink}.`
}

export const escapeHtml = (v: string): string => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const valueFor = (seg: Extract<Segment, { kind: 'tag' }>, ctx: MergeContext): string => {
  if (seg.name === 'firstName') return (ctx.firstName ?? '').trim() || seg.fallback
  if (seg.name === 'clubName') return ctx.clubName
  return ctx.volunteerLink ?? ''
}

/** The text part: tags replaced, nothing escaped. */
export function renderPlain(template: string, ctx: MergeContext): string {
  const r = parseTemplate(template)
  if (!r.ok) throw new Error(`Unknown tag ${r.tag}`)
  return r.segments.map((s) => (s.kind === 'text' ? s.value : valueFor(s, ctx))).join('').replace(/\r\n?/g, '\n').trim()
}

/** The HTML body: blank-line paragraphs, single line breaks kept, every substituted value escaped, the volunteer link a real link. */
export function renderParagraphsHtml(template: string, ctx: MergeContext, linkStyle = ''): string {
  const r = parseTemplate(template.replace(/\r\n?/g, '\n'))
  if (!r.ok) throw new Error(`Unknown tag ${r.tag}`)
  const html = r.segments
    .map((s) => {
      if (s.kind === 'text') return escapeHtml(s.value)
      const v = valueFor(s, ctx)
      if (s.name === 'volunteerLink' && v) return `<a href="${escapeHtml(v)}"${linkStyle ? ` style="${escapeHtml(linkStyle)}"` : ''}>${escapeHtml(v)}</a>`
      return escapeHtml(v)
    })
    .join('')
  return html
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 16px">${p.replace(/\n/g, '<br>')}</p>`)
    .join('\n')
}

export const usesTag = (text: string, name: (typeof KNOWN_TAGS)[number]): boolean => {
  const r = parseTemplate(text)
  return r.ok && r.segments.some((s) => s.kind === 'tag' && s.name === name)
}
