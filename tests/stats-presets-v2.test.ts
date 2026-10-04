import { describe, expect, it } from 'vitest'
import { PRESETS, presetHref } from '@/lib/stats/presets'
import { parseStatLabParams, rawFromSearchParams, statLabHref, statLabMode } from '@/lib/stats/statlab'
import { getLabColumn } from '@/lib/stats/statlab-columns'

const known = { seasons: ['Summer 2025/26'], grades: ['A Grade'] }
const parse = (href: string) => parseStatLabParams(rawFromSearchParams(new URL(href, 'http://x').searchParams), known)
const MATCH = ['fifty-makers', 'century-makers', 'five-for-club', 'run-out-specialists', 'boundary-hitters', 'best-partnerships']

describe('presets after StatLab v2 (spec 5.2)', () => {
  it('has at least eighteen with unique keys', () => {
    expect(PRESETS.length).toBeGreaterThanOrEqual(18)
    expect(new Set(PRESETS.map((p) => p.key)).size).toBe(PRESETS.length)
  })
  it('ships the six match-data presets and no opponent-specific one', () => {
    for (const k of MATCH) expect(PRESETS.some((p) => p.key === k), k).toBe(true)
    for (const p of PRESETS) expect(p.params.opp ?? 'all', p.key).toBe('all')
  })
  it.each(PRESETS.map((p) => [p.key, p] as const))('%s uses real columns, a displayed sort, and parses unchanged', (_k, preset) => {
    for (const c of preset.params.cols ?? []) expect(getLabColumn(c), c).toBeDefined()
    for (const k of Object.keys(preset.params.mins ?? {})) expect(getLabColumn(k), `min ${k}`).toBeDefined()
    expect(preset.params.cols).toContain(preset.params.sort!.key)
    const parsed = parse(presetHref(preset))
    expect(parsed.cols).toEqual(preset.params.cols)
    expect(parsed.sort).toEqual(preset.params.sort)
    expect(parsed.mins).toEqual(preset.params.mins ?? {})
    expect(statLabHref('/statlab', parsed)).toBe(presetHref(preset))
  })
  it('the six new presets are match mode and the twelve older ones stay season mode', () => {
    for (const p of PRESETS) expect(statLabMode(parse(presetHref(p))).mode, p.key).toBe(MATCH.includes(p.key) ? 'match' : 'season')
  })
})
