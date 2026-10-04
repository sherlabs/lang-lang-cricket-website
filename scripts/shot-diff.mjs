#!/usr/bin/env node
/**
 * Screenshot parity check for the theme work (docs/features/theme-editor.mdx, "How to verify").
 * Decodes two directories of PNGs with sharp and counts pixels whose channel difference exceeds a
 * threshold. Usage: node scripts/shot-diff.mjs <beforeDir> <afterDir> [--threshold=8] [--max-percent=0.05]
 * Exit code 1 when any pair differs by more than --max-percent of its pixels. No other dependencies.
 */
import { readdirSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const args = process.argv.slice(2)
const [beforeDir, afterDir] = args.filter((a) => !a.startsWith('--'))
const opt = (name, fallback) => Number((args.find((a) => a.startsWith(`--${name}=`)) ?? '').split('=')[1] ?? fallback) || fallback
const threshold = opt('threshold', 8)
const maxPercent = opt('max-percent', 0.05)
if (!beforeDir || !afterDir) {
  console.error('usage: node scripts/shot-diff.mjs <beforeDir> <afterDir> [--threshold=8] [--max-percent=0.05]')
  process.exit(2)
}

const raw = async (file) => {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height }
}

let failed = false
for (const name of readdirSync(beforeDir).filter((f) => f.endsWith('.png')).sort()) {
  const a = await raw(path.join(beforeDir, name))
  const b = await raw(path.join(afterDir, name)).catch(() => null)
  if (!b) { console.log(`${name}: MISSING in after`); failed = true; continue }
  if (a.width !== b.width || a.height !== b.height) { console.log(`${name}: size differs ${a.width}x${a.height} vs ${b.width}x${b.height}`); failed = true; continue }
  let diff = 0
  for (let i = 0; i < a.data.length; i += 4) {
    if (Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2])) > threshold) diff++
  }
  const percent = (diff / (a.width * a.height)) * 100
  const bad = percent > maxPercent
  if (bad) failed = true
  console.log(`${name}: ${diff} px differ (${percent.toFixed(4)}%) ${bad ? 'FAIL' : 'ok'}`)
}
process.exit(failed ? 1 : 0)
