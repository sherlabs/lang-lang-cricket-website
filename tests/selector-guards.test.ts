import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const walk = (dir: string, out: string[] = []): string[] => {
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(full)
  }
  return out
}
const code = (file: string) => fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n')

describe('selector area guards', () => {
  it('no page, action or route under app/(frontend)/selector reaches data without overrideAccess: false (the Local API default is to override)', () => {
    const files = walk(path.join(root, 'app/(frontend)/selector'))
    const bad: string[] = []
    for (const f of files) {
      const text = code(f)
      for (const m of text.matchAll(/\.(update|create|delete|find|findByID|count)\(\s*\{/g)) {
        // Walk to the matching brace to get the call's options object.
        let depth = 0
        let end = m.index! + m[0].length - 1
        for (; end < text.length; end++) {
          if (text[end] === '{') depth++
          else if (text[end] === '}' && --depth === 0) break
        }
        const call = text.slice(m.index!, end)
        if (/payload|this/.test(text.slice(Math.max(0, m.index! - 12), m.index!)) && !/overrideAccess\s*:\s*false/.test(call)) bad.push(`${path.relative(root, f)}: ${call.slice(0, 70)}`)
      }
      if (/\.db\./.test(text)) bad.push(`${path.relative(root, f)}: payload.db access`)
    }
    expect(bad, 'privileged reads and writes belong in lib/selector-queries.ts').toEqual([])
  })

  it('the pattern really flags an omitted overrideAccess', () => {
    const sample = "await payload.update({ collection: 'users', id: 1, data: {} })"
    expect(/overrideAccess\s*:\s*false/.test(sample)).toBe(false)
  })

  it('no page, action or route under app/(frontend)/selector passes overrideAccess: true', () => {
    const files = walk(path.join(root, 'app/(frontend)/selector'))
    expect(files.length).toBeGreaterThan(5)
    const bad = files.filter((f) => /overrideAccess\s*:\s*true/.test(code(f))).map((f) => path.relative(root, f))
    expect(bad, 'privileged reads and writes belong in lib/selector-queries.ts').toEqual([])
  })

  it('the brand-hex and club-name guards reach every new selector path', () => {
    // tests/no-brand-hex.test.ts scans app, components, lib, payload and config; assert the new files sit inside those roots.
    for (const p of ['app/(frontend)/selector', 'components/selector', 'lib/selector-queries.ts', 'lib/facebook-login.ts', 'lib/oauth-cookie.ts', 'lib/throttle.ts', 'lib/selector-auth.ts', 'payload/endpoints/selectors.ts', 'payload/components/SelectorsView.tsx']) {
      expect(fs.existsSync(path.join(root, p)), p).toBe(true)
      expect(/^(app|components|lib|payload|config)\//.test(p), p).toBe(true)
    }
  })

  it('the Facebook routes exist and return 404 when unconfigured (checked in the int tests)', () => {
    for (const r of ['start', 'callback', 'data-deletion', 'deauthorize']) expect(fs.existsSync(path.join(root, `app/(frontend)/selector/facebook/${r}/route.ts`)), r).toBe(true)
  })
})
