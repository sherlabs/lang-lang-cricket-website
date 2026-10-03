import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PLANTED } from '@/payload/scripts/fixtures/stats-seed-data'
import { seedStats } from '@/payload/scripts/fixtures/stats-seed-db'
import { destroyTestPayload, getTestPayload, resetGlobal } from './helpers'
import { resetPlayers } from './players-helpers'

// Spec A11 / section 6: the CSV export route against the seeded langlang_test DB.
describe('GET /statlab/export', () => {
  let payload: Payload

  beforeAll(async () => {
    payload = await getTestPayload()
    await resetGlobal(payload, 'site-settings')
    await resetPlayers(payload)
    await seedStats(payload)
  }, 180_000)

  afterAll(async () => {
    await resetPlayers(payload)
    await resetGlobal(payload, 'site-settings')
    await destroyTestPayload(payload)
  })

  const call = async (qs = '') => {
    const { GET } = await import('@/app/(frontend)/statlab/export/route')
    return GET(new Request(`http://localhost:3000/statlab/export${qs}`))
  }
  const lines = async (res: Response) => (await res.text()).trimEnd().split('\r\n')

  it('sends CSV with a download name from the whitelisted scope, a CDN cache header and noindex', async () => {
    const res = await call('?scope=season&cols=runs,wickets')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8')
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="langlang-statlab-season.csv"')
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=600, stale-while-revalidate=60')
    expect(res.headers.get('x-robots-tag')).toBe('noindex')
    expect(res.headers.get('x-export-truncated')).toBeNull()
    expect((await lines(res))[0]).toBe('Player,Season,Grades,Runs,Wickets')
  })

  it('never lets user input into headers: a hostile scope and query fall back to defaults', async () => {
    const res = await call('?scope=%22%0d%0aSet-Cookie:x&q=%0d%0aX-Evil:1&cols=runs')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="langlang-statlab-career.csv"')
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(res.headers.get('x-evil')).toBeNull()
  })

  it('matches the on-screen table (same code path) and honours the row count', async () => {
    const { runStatLab } = await import('@/lib/stats/statlab-queries')
    const { rawFromSearchParams } = await import('@/lib/stats/statlab')
    const qs = 'cols=runs,avg,wickets&sort=runs.desc&min.runs=100'
    const page = await runStatLab(rawFromSearchParams(new URLSearchParams(qs)))
    const csv = await lines(await call(`?${qs}`))
    expect(csv.length - 1).toBe(page.result.total)
    const first = page.result.rows.slice(0, 500)
    expect(csv.slice(1, 501).map((l) => l.split(',')[0])).toEqual(first.map((r) => r.name.startsWith('=') ? `'${r.name}` : r.name))
    // Top of the table is the planted career leader.
    expect(csv[1].split(',')[0]).toBe(`${PLANTED.careerLeader.firstName} ${PLANTED.careerLeader.lastName}`)
  })

  it('neutralises a player name that starts with a formula character', async () => {
    const out = await lines(await call('?cols=runs&q=formula'))
    expect(out).toHaveLength(2)
    expect(out[1].startsWith(`'=${PLANTED.formulaName.firstName.slice(1)} ${PLANTED.formulaName.lastName},`)).toBe(true)
  })

  it('never includes a hidden player', async () => {
    const text = await (await call('?scope=team-season&cols=runs,wickets,catches')).text()
    expect(text).not.toMatch(/Hidden Star/)
  })

  it('garbage params fall back safely to a valid CSV', async () => {
    const res = await call('?cols=zzz&sort=%00&min.runs=NaN&season=nope&grade=%FF&maxseasons=9e99')
    expect(res.status).toBe(200)
    expect((await lines(res))[0]).toBe('Player,Seasons,Grades,Games,Runs,Batting average,Strike rate,Wickets,Economy,Catches')
  })
})
