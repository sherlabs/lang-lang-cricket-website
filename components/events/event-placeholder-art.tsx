import { cn } from '@/lib/utils'

/**
 * Deterministic abstract header art for event cards with no cover image.
 *
 * Seeded purely by the event id: the same event always renders the same
 * composition, different events get visibly different ones. No randomness,
 * no time, no client JS — a plain inline SVG in the brand palette (black
 * ground, gold shapes) that matches the PageHeader's dark banner language.
 *
 * Three compositions (rings / diagonal bands / dot lattice), each further
 * varied by rotation, focal-point position and which gold tokens are used.
 */

// Theme variables, applied through `style` (a `var()` inside an SVG presentation attribute is not reliable in every browser).
const GOLD = ['rgb(var(--brand-gold))', 'rgb(var(--brand-gold-dark))', 'rgb(var(--brand-gold-light))'] as const
const BLACK = 'rgb(var(--brand-black))'

/** Small 32-bit integer hash (xorshift-ish) so nearby ids don't look alike. */
function hash32(seed: number): number {
  let x = (seed + 0x9e3779b9) | 0
  x ^= x >>> 16
  x = Math.imul(x, 0x85ebca6b)
  x ^= x >>> 13
  x = Math.imul(x, 0xc2b2ae35)
  x ^= x >>> 16
  return x >>> 0
}

/** Pull a bounded integer out of successive bit windows of the hash. */
function pick(h: number, shift: number, range: number): number {
  return ((h >>> shift) & 0xff) % range
}

type Props = {
  seed: number
  /** Presentation-only art; supply a label if the art carries meaning. */
  className?: string
}

export function EventPlaceholderArt({ seed, className }: Props) {
  const h = hash32(seed)
  const variant = pick(h, 0, 3)
  const rotation = pick(h, 8, 12) * 15 // 0..165°
  const fx = 20 + pick(h, 16, 61) // focal x 20..80 (%)
  const fy = 20 + pick(h, 24, 61)
  const gold = GOLD[pick(h, 4, GOLD.length)]
  const goldAlt = GOLD[(pick(h, 4, GOLD.length) + 1) % GOLD.length]
  const uid = `ev-art-${seed}`

  return (
    <svg
      viewBox="0 0 320 200"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      focusable="false"
      className={cn('block h-full w-full', className)}
    >
      <defs>
        <radialGradient id={`${uid}-glow`} cx={`${fx}%`} cy={`${fy}%`} r="70%">
          <stop offset="0%" style={{ stopColor: gold }} stopOpacity="0.55" />
          <stop offset="55%" style={{ stopColor: gold }} stopOpacity="0.12" />
          <stop offset="100%" style={{ stopColor: BLACK }} stopOpacity="0" />
        </radialGradient>
        <pattern id={`${uid}-bands`} width="28" height="28" patternUnits="userSpaceOnUse" patternTransform={`rotate(${rotation})`}>
          <rect width="10" height="28" style={{ fill: gold }} />
        </pattern>
        <pattern id={`${uid}-dots`} width="22" height="22" patternUnits="userSpaceOnUse" patternTransform={`rotate(${rotation})`}>
          <circle cx="11" cy="11" r="3" style={{ fill: gold }} />
        </pattern>
      </defs>

      <rect width="320" height="200" style={{ fill: BLACK }} />
      <rect width="320" height="200" fill={`url(#${uid}-glow)`} />

      {variant === 0 && (
        // Concentric rings radiating from the focal point, like a ball's seam.
        <g fill="none" style={{ stroke: gold }} strokeWidth="1.5" opacity="0.7" transform={`translate(${fx * 3.2} ${fy * 2})`}>
          {[28, 56, 84, 112, 140, 168].map((r, i) => (
            <circle key={r} r={r} strokeOpacity={1 - i * 0.14} strokeDasharray={i % 2 ? '6 10' : undefined} />
          ))}
          <circle r="12" style={{ fill: goldAlt }} stroke="none" />
        </g>
      )}

      {variant === 1 && (
        // Full-bleed bands with one heavier accent stripe at the same angle through the focal point.
        <g>
          <rect width="320" height="200" fill={`url(#${uid}-bands)`} opacity="0.45" />
          <g transform={`rotate(${rotation} ${fx * 3.2} ${fy * 2})`}>
            <rect x={fx * 3.2 - 8} y="-300" width="16" height="800" style={{ fill: goldAlt }} opacity="0.95" />
            <rect x={fx * 3.2 + 20} y="-300" width="3" height="800" style={{ fill: goldAlt }} opacity="0.7" />
          </g>
        </g>
      )}

      {variant === 2 && (
        // Dot lattice fading out around a solid gold disc.
        <g>
          <rect width="320" height="200" fill={`url(#${uid}-dots)`} opacity="0.45" />
          <circle cx={fx * 3.2} cy={fy * 2} r="46" style={{ fill: goldAlt }} opacity="0.9" />
          <circle cx={fx * 3.2} cy={fy * 2} r="46" fill="none" style={{ stroke: BLACK }} strokeWidth="6" />
          <circle cx={fx * 3.2} cy={fy * 2} r="60" fill="none" style={{ stroke: gold }} strokeWidth="1.5" opacity="0.8" />
        </g>
      )}
    </svg>
  )
}
