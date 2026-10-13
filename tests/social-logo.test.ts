import { randomBytes } from 'node:crypto'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { LogoCache, logoFromBytes, MAX_EDGE, storedFilePath, svgIsSelfContained, type LogoResult } from '@/lib/social/logo-core'

const base = () => sharp({ create: { width: 300, height: 120, channels: 4, background: { r: 20, g: 90, b: 160, alpha: 1 } } })
const withPadding = async (fmt: 'png' | 'webp' | 'jpeg' | 'gif' | 'avif') => {
  // A coloured block inside a transparent (white for JPEG) margin, so trimming has something to do.
  const block = await base().png().toBuffer()
  const img = sharp({ create: { width: 500, height: 300, channels: 4, background: fmt === 'jpeg' ? { r: 255, g: 255, b: 255, alpha: 1 } : { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: block, left: 100, top: 90 }])
  return img[fmt]().toBuffer()
}
const png = (r: LogoResult) => ('dataUri' in r ? Buffer.from(r.dataUri.split(',')[1], 'base64') : Buffer.alloc(0))
const SVG = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="120" height="60" viewBox="0 0 120 60">${inner}</svg>`
const OK_SVG = SVG('<rect width="120" height="60" fill="#c33"/><circle cx="60" cy="30" r="20" fill="#fff"/>')

describe('logoFromBytes', () => {
  for (const fmt of ['png', 'webp', 'jpeg', 'gif', 'avif'] as const) {
    it(`draws a ${fmt} logo as a trimmed PNG`, async () => {
      const r = await logoFromBytes(await withPadding(fmt))
      expect('dataUri' in r, JSON.stringify('error' in r ? r : '')).toBe(true)
      if (!('dataUri' in r)) return
      expect(r.dataUri.startsWith('data:image/png;base64,')).toBe(true)
      expect(await sharp(png(r)).metadata().then((m) => m.format)).toBe('png')
      // Padding is trimmed: the 500x300 canvas shrinks towards the 300x120 block (JPEG's white margin trims too).
      expect(r.width).toBeLessThan(500)
      expect(r.height).toBeLessThan(300)
    })
  }

  it('draws a safe SVG', async () => {
    const r = await logoFromBytes(Buffer.from(OK_SVG))
    expect('dataUri' in r).toBe(true)
  })

  it('keeps the long edge at most 1024', async () => {
    const big = await sharp({ create: { width: 3000, height: 900, channels: 3, background: '#336699' } }).png().toBuffer()
    const r = await logoFromBytes(big)
    if (!('dataUri' in r)) throw new Error('expected a logo')
    expect(Math.max(r.width, r.height)).toBeLessThanOrEqual(MAX_EDGE)
  })

  it('decides the type from the bytes, so a PNG stored under a wrong label still draws and text is unsupported', async () => {
    expect('dataUri' in (await logoFromBytes(await base().png().toBuffer()))).toBe(true)
    expect(await logoFromBytes(Buffer.from('this is a plain text file, not a picture'))).toEqual({ error: 'unreadable' })
  })

  it('refuses a corrupt file, an empty file, an oversize file and a pixel bomb', async () => {
    const good = await base().png().toBuffer()
    expect(await logoFromBytes(good.subarray(0, 40))).toEqual({ error: 'unreadable' })
    expect(await logoFromBytes(Buffer.alloc(0))).toEqual({ error: 'unreadable' })
    const noisy = await sharp(randomBytes(1600 * 1600 * 3), { raw: { width: 1600, height: 1600, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer()
    expect(noisy.length).toBeGreaterThan(5 * 1024 * 1024)
    expect(await logoFromBytes(noisy)).toEqual({ error: 'too_large' })
    const bomb = await sharp({ create: { width: 7000, height: 7000, channels: 3, background: '#000' } }).png({ compressionLevel: 9 }).toBuffer()
    expect(bomb.length).toBeLessThan(5 * 1024 * 1024)
    expect(await logoFromBytes(bomb)).toEqual({ error: 'too_large' })
  }, 60_000)

  const REJECTED: Record<string, string> = {
    'an embedded image': SVG('<image href="file:///etc/passwd" width="10" height="10"/>'),
    'an embedded data image': SVG('<image xlink:href="data:image/png;base64,AAAA" width="10" height="10"/>'),
    'a use of an outside file': SVG('<use xlink:href="other.svg#a"/>'),
    'a use with a plain href': SVG('<use href="/etc/hosts"/>'),
    'an entity': `<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]>${SVG('<text>&x;</text>')}`,
    'an internal DTD subset': `<!DOCTYPE svg [<!ELEMENT svg ANY>]>${SVG('<rect width="1" height="1"/>')}`,
    'a script': SVG('<script>alert(1)</script><rect width="1" height="1"/>'),
    'a foreignObject': SVG('<foreignObject width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>'),
    'a url() to a file': SVG('<rect width="10" height="10" style="fill:url(file:///etc/passwd)"/>'),
    'a url() to the network': SVG('<rect width="10" height="10" fill="url(http://example.com/x.png)"/>'),
    'an @import': SVG('<style>@import url(#a);</style><rect width="1" height="1"/>'),
    'an outside link': SVG('<a href="https://example.com"><rect width="1" height="1"/></a>'),
  }
  for (const [name, svg] of Object.entries(REJECTED)) {
    it(`rejects an SVG with ${name}`, async () => {
      expect(svgIsSelfContained(svg)).toBe(false)
      const r = await logoFromBytes(Buffer.from(svg))
      expect('error' in r && ['unsupported', 'unreadable'].includes(r.error)).toBe(true)
    })
  }

  it('accepts same-document references', () => {
    expect(svgIsSelfContained(SVG('<style>rect{fill:u\\72l(file:///etc/hosts)}</style><rect width="9" height="9"/>'))).toBe(false)
    expect(svgIsSelfContained(SVG('<rect width="9" height="9" style="fill:ur\\6c(http://x.test/a)"/>'))).toBe(false)
    expect(svgIsSelfContained(SVG('<defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><rect width="9" height="9" fill="url(#g)"/><use href="#g"/>'))).toBe(true)
  })
})

describe('LogoCache', () => {
  const ok = (n: number): LogoResult => ({ dataUri: 'x'.repeat(n), width: 1, height: 1 })
  it('holds at most the entry bound and evicts the least recently used', () => {
    const c = new LogoCache(3, 1e9)
    for (const k of ['a', 'b', 'c']) c.set(k, ok(10))
    c.get('a')
    c.set('d', ok(10))
    expect(c.size).toBe(3)
    expect(c.get('b')).toBeUndefined()
    expect(c.get('a')).toBeDefined()
  })
  it('holds at most the byte bound', () => {
    const c = new LogoCache(100, 100)
    for (let i = 0; i < 10; i++) c.set(`k${i}`, ok(30))
    expect(c.totalBytes).toBeLessThanOrEqual(100)
    expect(c.size).toBe(3)
  })
  it('keeps a failure for a minute only', () => {
    let t = 0
    const c = new LogoCache(5, 1000, 60_000, () => t)
    c.set('bad', { error: 'unreadable' })
    t = 59_000
    expect(c.get('bad')).toEqual({ error: 'unreadable' })
    t = 61_000
    expect(c.get('bad')).toBeUndefined()
  })
})

describe('storedFilePath', () => {
  it('stays inside the upload directory', () => {
    expect(storedFilePath('/srv/media', 'logo.webp')).toBe('/srv/media/logo.webp')
    expect(storedFilePath('/srv/media', '../secret.png')).toBeNull()
    expect(storedFilePath('/srv/media', 'a/b.png')).toBeNull()
    expect(storedFilePath('/srv/media', '')).toBeNull()
  })
})
