// @vitest-environment jsdom
import { createElement, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SocialComposer } from '@/payload/components/SocialComposer'

const refresh = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('next/dynamic', () => ({ default: () => () => null }))
vi.mock('@payloadcms/ui', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const tiles = [
  { key: 'sponsor-thanks' as const, label: 'Thank our sponsors', hint: 'Logos', textField: null },
  { key: 'result' as const, label: 'Result', hint: 'Score', textField: null },
]
const props = {
  api: '/api/admin/social',
  types: tiles,
  defaultStyle: 'classic' as const,
  settings: { hashtags: [], signOff: '', templates: {} as never },
  filePrefix: 'club',
  // The server props arrive EMPTY, as they do on a hard load (audit finding 4).
  initial: { type: '' as const, source: '', style: null, size: 'square' as const, text: '' },
  scheduling: { networks: [], unavailable: [], siteUrlOk: true, tz: 'UTC', locale: 'en-AU', window: { start: '08:00', end: '21:00' } as never, defaultDate: '2026-10-20', heartbeat: { lastChecked: '', warning: null, cadence: null }, edit: null },
}

const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve() }) }

describe('SocialComposer reads its state from the address after mount', () => {
  let host: HTMLElement
  let root: Root
  const requested: string[] = []

  beforeEach(() => {
    requested.length = 0
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    refresh.mockClear()
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined }))
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      requested.push(String(input))
      const url = String(input)
      if (url.includes('/sources')) return new Response(JSON.stringify({ multi: true, empty: '', choices: [{ id: '13', label: 'Alpha' }, { id: '17', label: 'Beta' }, { id: '20', label: 'Gamma' }] }))
      if (url.includes('/caption')) return new Response(JSON.stringify({ text: 'Thank you', unknown: [], alt: '' }))
      return new Response(new Blob(['x'], { type: 'image/png' }))
    }))
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
    window.history.replaceState(null, '', '/')
  })

  const mount = async (search: string) => {
    window.history.replaceState(null, '', `/admin/social${search}`)
    const replace = vi.spyOn(window.history, 'replaceState')
    await act(async () => { root.render(createElement(SocialComposer, props)) })
    await flush()
    return replace
  }
  const pressed = () => [...host.querySelectorAll('.social__tile[aria-pressed="true"]')].map((b) => b.textContent)
  const checked = () => [...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked')].map((i) => i.closest('label')?.textContent?.trim())

  it('selects the type and the items from the address and keeps the address as it was', async () => {
    const replace = await mount('?type=sponsor-thanks&source=13%2C17&style=bold&size=landscape')
    expect(pressed()[0]).toContain('Thank our sponsors')
    expect(checked()).toEqual(['Alpha', 'Beta'])
    expect(host.querySelector<HTMLInputElement>('input[name="social-style"]:checked')?.nextElementSibling?.textContent).toContain('Bold')
    expect(host.querySelector('.social__tab[aria-pressed="true"]')?.textContent).toContain('Wide')
    const q = new URLSearchParams(window.location.search)
    expect([q.get('type'), q.get('source'), q.get('style'), q.get('size')]).toEqual(['sponsor-thanks', '13,17', 'bold', 'landscape'])
    // The address is never erased on the way: no rewrite to a bare path happened at any point.
    for (const call of replace.mock.calls) expect(String(call[2])).not.toBe('/admin/social')
  })

  it('is not live before hydration finishes (controls are disabled, the region says it is busy)', () => {
    // Rendered on the server there is no client script, so the markup must say so.
    return import('react-dom/server').then(({ renderToString }) => {
      const html = renderToString(createElement(SocialComposer, props))
      expect(html).toContain('aria-busy="true"')
      expect(html).toMatch(/<button[^>]*class="social__tile"[^>]*disabled/)
    })
  })

  it('falls back to the neutral state for hostile values and cleans the address', async () => {
    await mount('?type=%3Cscript%3E&source=1&style=neon&size=huge&text=zzz')
    expect(pressed()).toEqual([])
    expect(window.location.search).toBe('')
    expect(requested.some((u) => u.includes('script'))).toBe(false)
  })

  it('drops source ids that are not on offer once the list has loaded', async () => {
    await mount('?type=sponsor-thanks&source=13%2C99')
    expect(checked()).toEqual(['Alpha'])
    expect(new URLSearchParams(window.location.search).get('source')).toBe('13')
  })

  it('keeps ?tab= and ?post= while rewriting, and asks the server again once when a post link arrived without its data', async () => {
    await mount('?tab=drafts&post=4')
    expect(new URLSearchParams(window.location.search).get('tab')).toBe('drafts')
    expect(new URLSearchParams(window.location.search).get('post')).toBe('4')
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
