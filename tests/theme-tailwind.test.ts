import { describe, expect, it } from 'vitest'
import { BRAND_KEYS, BRAND_TW } from '../config/brand'
import tailwind from '../tailwind.config'

describe('tailwind brand colours', () => {
  const brand = (tailwind.theme?.extend?.colors as Record<string, unknown>).brand as Record<string, string>
  it('are exactly the brand keys, each a variable reference with alpha support', () => {
    expect(Object.keys(brand).sort()).toEqual([...BRAND_KEYS].sort())
    for (const k of BRAND_KEYS) expect(brand[k]).toBe(`rgb(var(--brand-${k}) / <alpha-value>)`)
    expect(brand).toEqual(BRAND_TW)
  })
  it('card shadows use the variable, not a literal tint', () => {
    const shadows = tailwind.theme?.extend?.boxShadow as Record<string, string>
    for (const v of Object.values(shadows)) {
      expect(v).toContain('rgb(var(--brand-black) /')
      expect(v).not.toMatch(/rgba?\(\s*\d/)
    }
  })
})
