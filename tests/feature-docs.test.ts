/**
 * Drift check for docs/features. Every feature doc must have the frontmatter keys and the five
 * section headings, the index must link every doc, and `related` slugs must exist. The rule that
 * a feature ships with its doc is in CLAUDE.md.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = path.resolve(__dirname, '..', 'docs', 'features')
const files = readdirSync(dir).filter((f) => f.endsWith('.mdx'))
const docs = files.filter((f) => f !== 'index.mdx')
const read = (f: string) => readFileSync(path.join(dir, f), 'utf8')

const REQUIRED_KEYS = ['title', 'status', 'routes', 'collections', 'admin', 'owner', 'related', 'added']
const HEADINGS = ['## Persona', '## Why it was built', '## What it does', '## How to use it', '## Not included / deferred']

/** Minimal `---` block parser: top-level `key: value` lines only. */
function frontmatter(text: string): Record<string, string> | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!m) return null
  const out: Record<string, string> = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line)
    if (kv) out[kv[1]] = kv[2].trim()
  }
  return out
}

describe('feature docs', () => {
  it('has an index and at least one feature doc', () => {
    expect(files).toContain('index.mdx')
    expect(docs.length).toBeGreaterThan(0)
  })

  describe.each(docs)('%s', (file) => {
    const text = read(file)
    const fm = frontmatter(text)

    it('has frontmatter with every required key', () => {
      expect(fm, 'missing --- frontmatter block').not.toBeNull()
      const missing = REQUIRED_KEYS.filter((k) => !(k in (fm ?? {})))
      expect(missing).toEqual([])
    })

    it('is shipped and non-empty on the key fields', () => {
      expect(fm?.status).toBe('shipped')
      expect(fm?.title).toBeTruthy()
      expect(fm?.owner).toBeTruthy()
      expect(fm?.added).toBeTruthy()
    })

    it('has the five section headings, in order', () => {
      const lines = text.split(/\r?\n/)
      const positions = HEADINGS.map((h) => lines.findIndex((l) => l.trim() === h))
      expect(positions.map((p, i) => (p === -1 ? HEADINGS[i] : null)).filter(Boolean)).toEqual([])
      expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    })

    it('only relates to docs that exist', () => {
      const raw = fm?.related ?? ''
      const slugs = raw.replace(/^\[|\]$/g, '').split(',').map((s) => s.trim()).filter(Boolean)
      const unknown = slugs.filter((s) => !docs.includes(`${s}.mdx`))
      expect(unknown).toEqual([])
    })
  })

  describe('index.mdx', () => {
    const index = read('index.mdx')
    const linked = [...index.matchAll(/\]\(\.\/([\w-]+\.mdx)\)/g)].map((m) => m[1])

    it('links every feature doc', () => {
      expect(docs.filter((f) => !linked.includes(f))).toEqual([])
    })

    it('links only files that exist', () => {
      expect(linked.filter((f) => !files.includes(f))).toEqual([])
    })

    it('links each doc once or more but never itself', () => {
      expect(linked).not.toContain('index.mdx')
    })
  })

  it('doc bodies contain internal links that resolve', () => {
    const broken: string[] = []
    for (const f of docs) {
      for (const m of read(f).matchAll(/\]\(\.\/([\w-]+\.mdx)\)/g)) {
        if (!files.includes(m[1])) broken.push(`${f} -> ${m[1]}`)
      }
    }
    expect(broken).toEqual([])
  })
})
