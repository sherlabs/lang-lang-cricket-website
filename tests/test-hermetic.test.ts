import { describe, expect, it } from 'vitest'
import { restoreEnv, snapshotEnv } from './int/env-snapshot'
import pg from 'pg'
import PathSequencer, { sortSpecsByPath } from './sequencer'

describe('env snapshot', () => {
  it('removes added keys, resets changed keys, restores deleted keys', () => {
    const env: Record<string, string | undefined> = { A: '1', B: '2' }
    const snap = snapshotEnv(env)
    env.A = 'x'
    delete env.B
    env.NEW = 'y'
    const touched = restoreEnv(env, snap).sort()
    expect(touched).toEqual(['A', 'B', 'NEW'])
    expect(env).toEqual({ A: '1', B: '2' })
    expect('NEW' in env).toBe(false)
  })
})

describe('path sequencer', () => {
  it('orders by project then path regardless of input order', () => {
    const mk = (project: string, moduleId: string) => ({ project: { name: project }, moduleId })
    const input = [mk('unit', '/z.test.ts'), mk('int', '/b.int.test.ts'), mk('int', '/a.int.test.ts'), mk('unit', '/a.test.ts')]
    const out = sortSpecsByPath(input).map((s) => `${s.project.name}:${s.moduleId}`)
    expect(out).toEqual(['int:/a.int.test.ts', 'int:/b.int.test.ts', 'unit:/a.test.ts', 'unit:/z.test.ts'])
    expect(sortSpecsByPath([...input].reverse())).toEqual(sortSpecsByPath(input))
  })
})

describe('path sequencer class', () => {
  it('sorts by path unless files are shuffled', async () => {
    const mk = (moduleId: string) => ({ project: { name: 'int' }, moduleId }) as never
    const ctx = { config: { sequence: { shuffle: false } } } as never
    const out = await new PathSequencer(ctx).sort([mk('/b'), mk('/a')])
    expect(out.map((s: { moduleId: string }) => s.moduleId)).toEqual(['/a', '/b'])
  })
})

describe('pg-pool internals used by destroyTestPayload', () => {
  it('exposes _clients as an array', () => {
    const pool = new pg.Pool() as unknown as { _clients?: unknown }
    expect(Array.isArray(pool._clients)).toBe(true)
  })
})
