// Dev tool: measure the layout matrix with the real renderer and write tests/fixtures/<name>.json. `pnpm tsx scripts/layout-baseline.ts social-layout-before`
import { writeFileSync } from 'node:fs'
import { LAYOUT_CASES, measure } from '../tests/helpers/layout-metrics'
import { SIZE_KEYS, STYLE_KEYS } from '../lib/social/types'

const out: Record<string, { unused: number; gapV: number; gapH: number }> = {}
for (const c of LAYOUT_CASES) {
  const data = await c.data()
  for (const size of SIZE_KEYS) for (const style of STYLE_KEYS) out[`${c.id}|${size}|${style}`] = await measure(data, c.type, size, style)
}
writeFileSync(`tests/fixtures/${process.argv[2] ?? 'social-layout-before'}.json`, JSON.stringify(out, null, 1))
console.log('cases', Object.keys(out).length)
