import { describe, expect, it } from 'vitest'
import { PRESETS, presetHref } from '@/lib/stats/presets'
import { parseStatLabParams, rawFromSearchParams, statLabHref } from '@/lib/stats/statlab'

const known = { seasons: ['Summer 2025/26'], grades: ['A Grade'] }
const parse = (href: string) => parseStatLabParams(rawFromSearchParams(new URL(href, 'http://x').searchParams), known)

describe('StatLab presets', () => {
  it('has at least eighteen, with unique keys and labels', () => {
    expect(PRESETS.length).toBeGreaterThanOrEqual(18)
    expect(new Set(PRESETS.map((p) => p.key)).size).toBe(PRESETS.length)
    expect(new Set(PRESETS.map((p) => p.label)).size).toBe(PRESETS.length)
  })

  it.each(PRESETS.map((p) => [p.key, p] as const))('%s parses back to what it declares', (_k, preset) => {
    const parsed = parse(presetHref(preset))
    expect(parsed.cols).toEqual(preset.params.cols)
    expect(parsed.sort).toEqual(preset.params.sort)
    expect(parsed.mins).toEqual(preset.params.mins ?? {})
    expect(parsed.scope).toBe(preset.params.scope ?? 'career')
    expect(parsed.active).toBe(preset.params.active ?? false)
    expect(parsed.maxSeasons).toBe(preset.params.maxSeasons ?? null)
    // canonical: re-serialising the parsed result gives the same link
    expect(statLabHref('/statlab', parsed)).toBe(presetHref(preset))
  })

  it('sorts a preset on a displayed column', () => {
    for (const p of PRESETS) expect(p.params.cols).toContain(p.params.sort!.key)
  })
})
