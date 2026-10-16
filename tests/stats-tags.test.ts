import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { ALL_STATS_TAGS, MATCH_STORE_TAG, STATS_TAG, revalidateStats } from '@/lib/stats/tags'

const root = path.resolve(__dirname, '..')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.next', 'migrations', '.git', '.claude'].includes(name)) continue
    const p = path.join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name) && !/payload-types\.ts$/.test(name)) out.push(p)
  }
  return out
}

describe('stats cache tags', () => {
  it('has one definition: both tags, STATS_TAG re-exported from the stats queries', () => {
    expect(ALL_STATS_TAGS).toEqual(['player-stats', 'match-store'])
    expect(STATS_TAG).toBe('player-stats')
    expect(MATCH_STORE_TAG).toBe('match-store')
    const queries = readFileSync(path.join(root, 'lib/stats/queries.ts'), 'utf8')
    expect(queries).toMatch(/export \{ STATS_TAG \}/)
    expect(queries).not.toMatch(/export const STATS_TAG/)
    expect(queries).toMatch(/tags: \[\.\.\.ALL_STATS_TAGS\]/)
  })

  it('revalidates both tags with immediate expiry', async () => {
    const cache = { revalidateTag: vi.fn(), revalidatePath: vi.fn() }
    vi.doMock('next/cache', () => cache)
    vi.resetModules()
    const { revalidateStats: fresh } = await import('@/lib/stats/tags')
    await fresh(['/stats'])
    expect(cache.revalidateTag.mock.calls).toEqual([['player-stats', { expire: 0 }], ['match-store', { expire: 0 }]])
    expect(cache.revalidatePath).toHaveBeenCalledWith('/stats')
    vi.doUnmock('next/cache')
    expect(typeof revalidateStats).toBe('function')
  })

  it('no source file passes a bare tag literal to revalidatePaths or the revalidate hooks', () => {
    const offenders: string[] = []
    for (const dir of ['app', 'lib', 'payload', 'components']) {
      for (const file of walk(path.join(root, dir))) {
        const src = readFileSync(file, 'utf8')
        if (/revalidate(?:Paths|AfterChange|AfterDelete)\([^;]*\[\s*'(?:player-stats|match-store)'/.test(src.replace(/\n/g, ' '))) offenders.push(path.relative(root, file))
        if (/const STATS_TAGS\s*=/.test(src)) offenders.push(`${path.relative(root, file)} (local STATS_TAGS)`)
      }
    }
    expect(offenders).toEqual([])
  })
})
