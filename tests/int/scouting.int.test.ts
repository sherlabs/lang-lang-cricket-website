/**
 * scouting.int (wave E, WP-1): the opposition scouting report against the seeded match store. The ledger equals the seeded games, a
 * hidden club player is absent, an imported game counts for the ledger only, opposition names reach only selector pages (and not even
 * those when the club-wide setting is off), the unknown-key 404 does not echo the key, and the loaders use batched queries.
 */
import type { Payload } from 'payload'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { SCOUTING } from '@/config/site'
import { generateMatchSeed, DEMO_OPPOSITION_PLAYER } from '../../payload/scripts/fixtures/match-seed-data'
import { seedMatchSeasonRows, seedMatchStore } from '../../payload/scripts/fixtures/match-seed-db'
import { clearCollection, destroyTestPayload, getTestPayload, rest, tokenFor } from './helpers'
import { resetMatches } from './match-helpers'

const cached = vi.hoisted(() => ({ values: [] as unknown[] }))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(), revalidatePath: vi.fn(),
  // Record whatever any cached reader stores, so the match-facts blob can be searched for opposition names.
  unstable_cache: <T,>(fn: () => Promise<T>) => async () => { const v = await fn(); cached.values.push(v); return v },
}))
vi.mock('@/components/stats/stats-sub-nav', () => ({ StatsSubNav: () => null }))
// The pages authenticate for real: the request headers carry a JWT (or nothing), and Payload resolves the user.
const nav = vi.hoisted(() => ({ headers: new Headers() }))
vi.mock('next/headers', () => ({ headers: async () => nav.headers, cookies: async () => ({ get: () => undefined }) }))
const signIn = async (role: 'selector' | 'editor' | 'admin' | null) => {
  nav.headers = new Headers(role ? { authorization: `JWT ${await tokenFor(payload, role)}` } : {})
}

const ORG = '484ced51-403a-466c-9a94-bd95eedf7319'
let payload: Payload
let key: string
let label: string
const selector = () => ({ id: 1, role: 'selector', collection: 'users', email: 'selector@example.com' }) as never
const text = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/\s+/g, ' ')

const oppNames = async (): Promise<string[]> => {
  const { docs } = await payload.find({ collection: 'match-appearances', where: { isClubSide: { equals: false } }, pagination: false, depth: 0, overrideAccess: true, select: { displayName: true } })
  return [...new Set(docs.map((d) => String(d.displayName)).filter(Boolean))]
}
const setNames = (on: boolean) => payload.updateGlobal({ slug: 'selection-settings', data: { scouting: { showOppositionNames: on, minInnings: 2 } } as never, overrideAccess: true, context: { disableRevalidate: true } })

beforeAll(async () => {
  payload = await getTestPayload()
  await clearCollection(payload, 'users')
  await resetMatches(payload)
  await seedMatchStore(payload, { clubOrgId: ORG })
  await seedMatchSeasonRows(payload, ORG)
  const first = generateMatchSeed(ORG).find((g) => g.raw.status === 'FINAL' && g.raw.teams.find((t) => t.organisation.id !== ORG)!.organisation.name === 'Caldermeade Rovers')!
  const opp = first.raw.teams.find((t) => t.organisation.id !== ORG)!.organisation
  key = opp.id
  label = opp.name
}, 180_000)
afterAll(async () => {
  await resetMatches(payload)
  await clearCollection(payload, 'users')
  await destroyTestPayload(payload)
})
afterEach(async () => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  nav.headers = new Headers()
  await setNames(true)
})

describe('the report against the seeded store', () => {
  it('the seed really holds the invented opposition player (so the absence checks below cannot pass on an empty seed)', async () => {
    expect(await oppNames()).toContain(DEMO_OPPOSITION_PLAYER)
  })

  it('lists every opposition and the ledger equals the seeded games', async () => {
    const { loadOpponentList, loadScoutingReport } = await import('@/lib/selector-scouting-queries')
    const list = await loadOpponentList(selector())
    expect(list.map((o) => o.label).sort()).toEqual(['Bunyip Creek', 'Caldermeade Rovers', 'Garfield Bandits', 'Koo Wee Rup Colts', 'Nyora Hawks', 'Tynong North'])
    const seeded = generateMatchSeed(ORG).filter((g) => g.raw.status === 'FINAL' && g.raw.teams.some((t) => t.organisation.id === key))
    expect(list.find((o) => o.key === key)?.played).toBe(seeded.length)
    const report = (await loadScoutingReport(selector(), key))!
    expect(report.label).toBe(label)
    expect(report.h2h.total.played).toBe(seeded.length)
    expect(report.games).toHaveLength(seeded.length)
    expect(report.enough).toBe(seeded.length >= SCOUTING.minSample)
    expect(report.h2h.total.won + report.h2h.total.lost + report.h2h.total.drawn + report.h2h.total.tied + report.h2h.total.noResult + report.h2h.total.wonByForfeit + report.h2h.total.lostByForfeit + report.h2h.total.unknown).toBe(seeded.length)
  })

  it('names their danger players when the club allows it, and renders them', async () => {
    const { loadScoutingReport } = await import('@/lib/selector-scouting-queries')
    const { ScoutingReportView } = await import('@/components/selector/scouting-report')
    const report = (await loadScoutingReport(selector(), key))!
    expect(report.danger.mode).toBe('named')
    const html = text(renderToStaticMarkup(ScoutingReportView({ report, locale: 'en-AU' })))
    expect(html).toContain('Third-party names, for selection use only')
    expect(html).toContain('Game plan')
    if (report.danger.mode === 'named') expect(report.danger.batters.length + report.danger.bowlers.length).toBeGreaterThan(0)
  })

  it('shows no opposition name anywhere when the club-wide setting is off', async () => {
    await setNames(false)
    const { loadScoutingReport } = await import('@/lib/selector-scouting-queries')
    const { ScoutingReportView } = await import('@/components/selector/scouting-report')
    const report = (await loadScoutingReport(selector(), key))!
    expect(report.danger.mode).toBe('positions')
    const html = text(renderToStaticMarkup(ScoutingReportView({ report, locale: 'en-AU' })))
    const names = await oppNames()
    expect(names.length).toBeGreaterThan(10)
    for (const n of names) {
      expect(html, n).not.toContain(n)
      expect(JSON.stringify(report), n).not.toContain(n)
    }
    expect(html).toContain('Batting at')
  })

  it('leaves a hidden club player out of our best and every count that could identify them', async () => {
    const { loadScoutingReport } = await import('@/lib/selector-scouting-queries')
    const report = (await loadScoutingReport(selector(), key))!
    expect(JSON.stringify(report)).not.toMatch(/glover/i)
    expect(report.best.batters.length).toBeGreaterThan(0)
    expect(report.best.batters.every((b) => b.name !== 'Hamish Glover')).toBe(true)
  })

  it('hiding a visible player removes them from our best at once', async () => {
    const { loadScoutingReport } = await import('@/lib/selector-scouting-queries')
    const before = (await loadScoutingReport(selector(), key))!
    const target = before.best.batters[0] ?? before.best.bowlers[0]
    expect(target).toBeTruthy()
    await payload.update({ collection: 'players', id: target.id, data: { hidden: true } as never, overrideAccess: true, context: { disableRevalidate: true } })
    try {
      const after = (await loadScoutingReport(selector(), key))!
      expect([...after.best.batters, ...after.best.bowlers].some((b) => b.id === target.id)).toBe(false)
      expect(JSON.stringify(after)).not.toContain(target.name)
    } finally {
      await payload.update({ collection: 'players', id: target.id, data: { hidden: false } as never, overrideAccess: true, context: { disableRevalidate: true } })
    }
  })

  it('counts an imported game for the ledger only (no totals, no opposition people)', async () => {
    const { loadScoutingReport } = await import('@/lib/selector-scouting-queries')
    await payload.create({
      collection: 'matches',
      data: { gameId: 'imp-scout-1', status: 'FINAL', seasonName: 'Summer 2019/20', seasonStartYear: 2019, gradeName: 'A Grade', localDate: '2019-11-02', opponentName: 'Imported Only CC', isHome: true, result: 'won', source: 'import', importBatch: 'scout-test' } as never,
      overrideAccess: true, context: { disableRevalidate: true },
    })
    const list = await (await import('@/lib/selector-scouting-queries')).loadOpponentList(selector())
    const imported = list.find((o) => o.label === 'Imported Only CC')!
    expect(imported.played).toBe(1)
    const report = (await loadScoutingReport(selector(), imported.key))!
    expect(report.h2h.total).toMatchObject({ played: 1, won: 1 })
    expect(report.imported).toBe(1)
    expect(report.enough).toBe(false)
    expect(report.totals.theirs.all.n).toBe(0)
    expect(report.toss.known).toBe(0)
    expect(report.plan).toEqual([])
    expect(report.danger.mode === 'named' && report.danger.batters.length + report.danger.bowlers.length).toBe(0)
    const { ScoutingReportView } = await import('@/components/selector/scouting-report')
    const html = text(renderToStaticMarkup(ScoutingReportView({ report, locale: 'en-AU' })))
    expect(html).toContain('Only 1 game stored against Imported Only CC')
    expect(html).toContain('not enough for a plan yet')
  })

  it('reads in batches: one query per collection, the opponent list from matches only', async () => {
    const { loadOpponentList, loadScoutingReport } = await import('@/lib/selector-scouting-queries')
    const find = vi.spyOn(payload, 'find')
    await loadOpponentList(selector())
    expect(find.mock.calls.map((c) => c[0].collection)).toEqual(['matches'])
    find.mockClear()
    await loadScoutingReport(selector(), key)
    const by = new Map<string, number>()
    for (const c of find.mock.calls) by.set(String(c[0].collection), (by.get(String(c[0].collection)) ?? 0) + 1)
    for (const c of ['match-innings', 'match-appearances', 'match-batting', 'match-bowling'] as const) expect(by.get(c), c).toBe(1)
    // The two match reads are the reference list and the chosen rows; the facts reader adds its own cached season reads.
    const cl = find.mock.calls.find((c) => c[0].collection === 'match-appearances')![0]
    expect(JSON.stringify(cl.where)).toContain('"isClubSide":{"equals":false}')
    expect(cl.pagination).toBe(false)
  })

  it('makes no network call', async () => {
    const f = vi.fn(() => { throw new Error('network call in scouting') })
    vi.stubGlobal('fetch', f)
    const { loadOpponentList, loadScoutingReport, resolveOpponents } = await import('@/lib/selector-scouting-queries')
    await loadOpponentList(selector())
    await loadScoutingReport(selector(), key)
    await resolveOpponents(selector(), ['Caldermeade Rovers'])
    expect(f).not.toHaveBeenCalled()
  })
})

describe('linking an upcoming game', () => {
  it('resolves by name, lists nothing for an unknown club, and never guesses', async () => {
    const { resolveOpponents } = await import('@/lib/selector-scouting-queries')
    const r = await resolveOpponents(selector(), ['Caldermeade Rovers', 'caldermeade  rovers a grade', 'Nobody Rovers', ''])
    expect(r['Caldermeade Rovers']).toEqual({ kind: 'one', key, label })
    expect(r['caldermeade  rovers a grade']).toEqual({ kind: 'one', key, label })
    expect(r['Nobody Rovers']).toEqual({ kind: 'none' })
    expect(r['']).toBeUndefined()
  })
})

describe('access', () => {
  it('refuses anyone who is not admin, editor or selector, in every exported function', async () => {
    const q = await import('@/lib/selector-scouting-queries')
    for (const who of [null, undefined, { id: 1, role: 'nobody', collection: 'users' }, { id: 2, collection: 'users' }]) {
      await expect(q.loadOpponentList(who as never)).rejects.toThrow(/Selector access/)
      await expect(q.loadScoutingReport(who as never, key)).rejects.toThrow(/Selector access/)
      await expect(q.resolveOpponents(who as never, ['x'])).rejects.toThrow(/Selector access/)
    }
  })

  it('lets a selector, an editor and an admin load the report', async () => {
    const q = await import('@/lib/selector-scouting-queries')
    for (const role of ['selector', 'editor', 'admin']) {
      expect(await q.loadScoutingReport({ id: 1, role, collection: 'users' } as never, key)).toMatchObject({ key })
    }
  })

  it('a selector still gets 403 on the match tables over REST; an editor can read them', async () => {
    const sel = await tokenFor(payload, 'selector')
    const ed = await tokenFor(payload, 'editor')
    for (const c of ['match-appearances', 'match-batting', 'match-bowling', 'matches', 'match-innings']) {
      expect((await rest('GET', `/${c}?limit=1`, { token: sel })).status, c).toBe(403)
      expect((await rest('GET', `/${c}?limit=1`)).status, `${c} anonymous`).toBeOneOf([401, 403])
      expect((await rest('GET', `/${c}?limit=1`, { token: ed })).status, `${c} editor`).toBe(200)
    }
  })

  it('only an admin changes the scouting settings; a selector and an editor cannot over REST', async () => {
    const sel = await tokenFor(payload, 'selector')
    const ed = await tokenFor(payload, 'editor')
    const admin = await tokenFor(payload, 'admin')
    const body = { scouting: { showOppositionNames: false } }
    expect((await rest('POST', '/globals/selection-settings', { body, token: sel })).status).toBe(403)
    expect((await rest('POST', '/globals/selection-settings', { body, token: ed })).status).toBe(403)
    expect((await rest('POST', '/globals/selection-settings', { body, token: admin })).status).toBe(200)
    const q = await import('@/lib/selector-scouting-queries')
    expect((await q.loadScoutingReport(selector(), key))!.danger.mode).toBe('positions')
  })
})

describe('the pages', () => {
  const run = async (fn: () => unknown) => {
    try {
      await fn()
      return null
    } catch (e) {
      return e as { digest?: string; message?: string }
    }
  }

  it('redirects a signed-out visitor to the selector login on both pages', async () => {
    await signIn(null)
    const list = await import('@/app/(frontend)/selector/(area)/scouting/page')
    const rep = await import('@/app/(frontend)/selector/(area)/scouting/[opp]/page')
    for (const e of [await run(() => list.default({ searchParams: Promise.resolve({}) })), await run(() => rep.default({ params: Promise.resolve({ opp: encodeURIComponent(key) }) }))]) {
      expect(e?.digest).toMatch(/^NEXT_REDIRECT/)
      expect(e?.digest).toContain('/selector/login')
    }
  })

  it('renders the list and the report for a selector', async () => {
    await signIn('selector')
    const list = await import('@/app/(frontend)/selector/(area)/scouting/page')
    const rep = await import('@/app/(frontend)/selector/(area)/scouting/[opp]/page')
    const listHtml = text(renderToStaticMarkup((await list.default({ searchParams: Promise.resolve({ q: 'bunyip' }) })) as React.ReactElement))
    expect(listHtml).toContain('Bunyip Creek')
    expect(listHtml).not.toContain('Caldermeade Rovers')
    const repHtml = text(renderToStaticMarkup((await rep.default({ params: Promise.resolve({ opp: encodeURIComponent(key) }) })) as React.ReactElement))
    expect(repHtml).toContain('Caldermeade Rovers')
    expect(repHtml).toContain('Danger batters and bowlers')
  })

  it('an unknown key is the standard 404 and the key is echoed nowhere', async () => {
    await signIn('selector')
    const probe = 'n:probe-key-7f3a91-do-not-echo'
    const spies = (['log', 'warn', 'error', 'info', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined))
    const rep = await import('@/app/(frontend)/selector/(area)/scouting/[opp]/page')
    const e = await run(() => rep.default({ params: Promise.resolve({ opp: encodeURIComponent(probe) }) }))
    expect(e?.digest).toMatch(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/)
    expect(`${e?.digest} ${e?.message}`).not.toContain('probe-key')
    expect(JSON.stringify(spies.flatMap((s) => s.mock.calls))).not.toContain('probe-key')
    const meta = rep.metadata
    expect(JSON.stringify(meta)).not.toContain('probe-key')
    // A malformed escape is a 404 too, not a 500.
    const bad = await run(() => rep.default({ params: Promise.resolve({ opp: '%E0%A4%A' }) }))
    expect(bad?.digest).toMatch(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND|NEXT_REDIRECT/)
  })
})

describe('opposition names stay off public surfaces', () => {
  it('are in no cached reader value, including the match-facts blob, and in no public stats page', async () => {
    expect(await oppNames()).toContain(DEMO_OPPOSITION_PLAYER)
    cached.values.length = 0
    const { getAllFacts } = await import('@/lib/match-store/stats-queries')
    await getAllFacts()
    expect(cached.values.length).toBeGreaterThan(0)
    const names = await oppNames()
    const blob = JSON.stringify(cached.values)
    for (const n of names) expect(blob, n).not.toContain(n)
    const { default: Page } = await import('@/app/(frontend)/stats/opposition/page')
    const html = text(renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) })))
    expect(html).toContain('Caldermeade Rovers')
    for (const n of names) expect(html, n).not.toContain(n)
  })
})

