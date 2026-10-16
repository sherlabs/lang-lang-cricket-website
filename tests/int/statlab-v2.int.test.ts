/**
 * statlab-v2.int (W2 spec 5): the opponent filter equals a manual sum over the stored rows, match mode and
 * season mode say which source they use, every preset runs and exports clean CSV, a hidden player is in
 * neither mode, and the caption sidecar carries the same coverage text as the page.
 */
import { eq } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { matchTables } from '@/lib/match-store/db'
import { readStoredBundles } from '@/lib/match-store/read'
import { oppositionKey } from '@/lib/stats/match/opposition-key'
import { PRESETS, presetHref } from '@/lib/stats/presets'
import { rawFromSearchParams, statLabCsv, statLabHref } from '@/lib/stats/statlab'
import { generateMatchSeed, MATCH_SEED_HIDDEN_KEY } from '../../payload/scripts/fixtures/match-seed-data'
import { seedMatchSeasonRows, seedMatchStore } from '../../payload/scripts/fixtures/match-seed-db'
import { destroyTestPayload, getTestPayload, resetGlobal } from './helpers'
import { resetMatches } from './match-helpers'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: <T,>(fn: () => Promise<T>) => fn }))

const ORG = '484ced51-403a-466c-9a94-bd95eedf7319'
let payload: Payload
let hiddenId: number

const run = async (qs: string) => {
  const { runStatLab } = await import('@/lib/stats/statlab-queries')
  return runStatLab(rawFromSearchParams(new URLSearchParams(qs)))
}

beforeAll(async () => {
  payload = await getTestPayload()
  await resetGlobal(payload, 'site-settings')
  await resetMatches(payload)
  await seedMatchStore(payload, { clubOrgId: ORG })
  await seedMatchSeasonRows(payload, ORG)
  const t = matchTables(payload)
  const [h] = await payload.db.drizzle.select({ id: t.players.id }).from(t.players).innerJoin(t.player_aliases, eq(t.player_aliases.player, t.players.id)).where(eq(t.player_aliases.nameKey, MATCH_SEED_HIDDEN_KEY))
  hiddenId = h.id
}, 180_000)
afterAll(async () => {
  await resetMatches(payload)
  await resetGlobal(payload, 'site-settings')
  await destroyTestPayload(payload)
})

describe('opponent filter', () => {
  it('equals a manual sum over the stored batting rows of that opposition', async () => {
    const bundles = await readStoredBundles(payload)
    const opp = oppositionKey(bundles.find((b) => b.match.status === 'FINAL')!.match)
    const manual = new Map<number, { runs: number; fifties: number; innings: number }>()
    for (const b of bundles) {
      if (b.match.status !== 'FINAL' || oppositionKey(b.match) !== opp) continue
      const played = new Set(b.innings.filter((i) => i.played && i.isClubBatting).map((i) => i.sequenceNo))
      for (const r of b.batting) {
        const a = b.appearances.find((x) => x.appearanceId === r.appearanceId)
        if (!a?.isClubSide || a.player === null || a.player === hiddenId || !played.has(r.inningsSeq) || r.battingStatus === 'did_not_bat') continue
        const m = manual.get(a.player) ?? { runs: 0, fifties: 0, innings: 0 }
        m.runs += r.runs
        m.innings++
        if (r.runs >= 50 && r.runs < 100) m.fifties++
        manual.set(a.player, m)
      }
    }
    expect(manual.size).toBeGreaterThan(0)
    const lab = await run(`cols=runs,innings,fifties&opp=${encodeURIComponent(opp)}`)
    expect(lab.result.mode).toBe('match')
    expect(lab.params.opp).toBe(opp)
    for (const row of lab.result.rows) {
      const want = manual.get(row.playerId)
      if (!want) continue
      expect(row.counts.batRuns, row.name).toBe(want.runs)
      expect(row.counts.batInnings, row.name).toBe(want.innings)
      expect(row.match?.counts.fifties, row.name).toBe(want.fifties)
    }
    // Every player with batting rows against them is in the table (those who only fielded or bowled may be too).
    const inTable = new Set(lab.result.rows.map((r) => r.playerId))
    for (const id of manual.keys()) expect(inTable.has(id)).toBe(true)
  })

  it('an unknown opposition key is dropped, so the table is back in season mode', async () => {
    const lab = await run('cols=runs,avg&opp=not-a-club')
    expect(lab.params.opp).toBe('all')
    expect(lab.result.mode).toBe('season')
  })
})

describe('modes and captions', () => {
  it('season mode says season totals; a match column or an opposition switches to match data and back', async () => {
    const season = await run('cols=runs,avg')
    expect(season.caption).toMatch(/^Season totals/)
    expect(season.result.mode).toBe('season')
    const forced = await run('cols=runs,avg,fifties')
    expect(forced.caption).toMatch(/^From match data\. From /)
    expect(forced.caption).toMatch(/games stored/)
    expect(forced.result.forcedByColumn).toBe(true)
    const fmt = await run('cols=runs&fmt=twoDay')
    expect(fmt.result.mode).toBe('match')
    expect(fmt.result.forcedByColumn).toBe(false)
    const cleared = await run('cols=runs,avg')
    expect(cleared.result.mode).toBe('season')
  })

  it('a ball-based column adds the ball coverage to the caption', async () => {
    const lab = await run('cols=goldenDucks')
    expect(lab.caption).toMatch(/\d+ of \d+ innings have ball-by-ball totals/)
  })

  it('the format filter keeps only that format', async () => {
    const all = await run('cols=games&scope=career&fmt=oneDay')
    const two = await run('cols=games&scope=career&fmt=twoDay')
    const bundles = (await readStoredBundles(payload)).filter((b) => b.match.status === 'FINAL')
    expect(bundles.some((b) => b.match.type === 'twoDay')).toBe(true)
    const games = (r: typeof all) => r.result.rows.reduce((s, x) => s + x.counts.games, 0)
    const appearances = (type: string) => bundles.filter((b) => b.match.type === type).reduce((s, b) => s + b.appearances.filter((a) => a.isClubSide && a.player !== null && a.player !== hiddenId).length, 0)
    expect(games(all)).toBe(appearances('oneDay'))
    expect(games(two)).toBe(appearances('twoDay'))
  })

  it('the hidden player is in neither mode', async () => {
    for (const qs of ['cols=runs', 'cols=runs,fifties', 'cols=runs&opp=all&fmt=oneDay']) {
      const lab = await run(qs)
      expect(lab.result.rows.some((r) => r.playerId === hiddenId), qs).toBe(false)
    }
  })

  it('season and team-season scopes work in match mode', async () => {
    const bySeason = await run('cols=runs,fifties&scope=season')
    expect(new Set(bySeason.result.rows.map((r) => r.season)).size).toBeGreaterThan(1)
    const byTeam = await run('cols=runs,fifties&scope=team-season')
    expect(byTeam.result.rows.every((r) => r.team !== '')).toBe(true)
  })
})

describe('presets and export', () => {
  it.each(PRESETS.map((p) => [p.key, p] as const))('%s opens, parses and exports a clean CSV', async (_k, preset) => {
    const href = presetHref(preset)
    const qs = href.includes('?') ? href.slice(href.indexOf('?') + 1) : ''
    const lab = await run(qs)
    expect(statLabHref('/statlab', lab.params)).toBe(href)
    const { csv } = statLabCsv(lab.params, lab.result, 5000, lab.settings.matchMinimums)
    const lines = csv.trimEnd().split('\r\n')
    expect(lines.length).toBeGreaterThanOrEqual(1)
    expect(lines.some((l) => l.startsWith('#'))).toBe(false)
    for (const l of lines.slice(1)) {
      // Player is the first cell; a formula-looking name must be guarded.
      expect(/^[=+\-@|]/.test(l), l).toBe(false)
    }
    expect(lines[0].endsWith(',Source')).toBe(lab.result.mode === 'match')
  })

  it('the export route and its caption sidecar share one coverage caption', async () => {
    const { GET } = await import('@/app/(frontend)/statlab/export/route')
    const { GET: CAPTION } = await import('@/app/(frontend)/statlab/export/caption/route')
    const follow = async (handler: (r: Request) => Promise<Response>, path: string) => {
      const first = await handler(new Request(`http://localhost:3000${path}`))
      return first.status === 308 ? handler(new Request(new URL(first.headers.get('location')!, 'http://localhost:3000'))) : first
    }
    const csv = await follow(GET, '/statlab/export?cols=runs,fifties&fmt=oneDay')
    expect(csv.status).toBe(200)
    expect(csv.headers.get('content-disposition')).toMatch(/statlab-career-match\.csv/)
    const body = await csv.text()
    expect(body.split('\r\n')[0]).toBe('Player,Seasons,Grades,Runs,Fifties,Source')
    expect(body).not.toMatch(/^#/m)
    const cap = await follow(CAPTION, '/statlab/export/caption?cols=runs,fifties&fmt=oneDay')
    expect(cap.headers.get('content-type')).toMatch(/text\/plain/)
    expect(cap.headers.get('x-robots-tag')).toBe('noindex')
    const text = await cap.text()
    const page = await run('cols=runs,fifties&fmt=oneDay')
    expect(text.trim()).toBe(`${page.caption}.`)
  })

  it('seeds enough oppositions for the filter to be useful', () => {
    const keys = new Set(generateMatchSeed(ORG).filter((g) => g.raw.status === 'FINAL').map((g) => g.raw.teams.find((t) => t.organisation.id !== ORG)!.organisation.id))
    expect(keys.size).toBeGreaterThan(2)
  })
})
