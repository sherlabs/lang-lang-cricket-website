import { contrastRatio } from './contrast'
import { normalizeHex, type ShadeName } from './tokens'

const toRgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
const toHex = (rgb: number[]): string => `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`.toUpperCase()

/** Mix `a` toward `b` by `t` (0 = a, 1 = b). Both `#RRGGBB`. */
export function mixHex(a: string, b: string, t: number): string {
  const [x, y] = [toRgb(a), toRgb(b)]
  return toHex(x.map((v, i) => v + (y[i] - v) * t))
}

/**
 * Suggested shades from the two main colours the designer cares about. Pure; the Site look form applies the result to
 * the shade fields when the designer presses "Suggest shades", and they can still edit each one. The deep accent is
 * darkened until it reads at 4.5 to 1 on both white and the pale tint (the pairs the save check enforces).
 */
export function suggestShades(accent: string, primary: string, surface: string): Partial<Record<ShadeName, string>> | null {
  const [a, p, s] = [normalizeHex(accent), normalizeHex(primary), normalizeHex(surface)]
  if (!a || !p || !s) return null
  const accentPale = mixHex(a, '#FFFFFF', 0.82)
  let accentDeep = mixHex(a, '#000000', 0.3)
  for (let t = 0.3; t < 0.95 && (contrastRatio(accentDeep, '#FFFFFF') < 4.5 || contrastRatio(accentDeep, accentPale) < 4.5); t += 0.05) {
    accentDeep = mixHex(a, '#000000', t)
  }
  return {
    ink: mixHex(p, '#FFFFFF', 0.08),
    accentDark: mixHex(a, '#000000', 0.18),
    accentLight: mixHex(a, '#FFFFFF', 0.4),
    accentPale,
    accentDeep,
    surfaceMuted: mixHex(s, '#000000', 0.03),
  }
}
