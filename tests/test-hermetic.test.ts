import { describe, expect, it } from 'vitest'
import { restoreEnv, snapshotEnv } from './int/env-snapshot'
import { sortSpecsByPath } from './sequencer'

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
