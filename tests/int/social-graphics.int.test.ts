/**
 * Wave C WP-1 against real Postgres: every graphic type through the staff route, the one-404 rule for everyone else, the junior
 * consent rule in every loader and chooser, the social-settings access matrix, the render rate limit, the sponsor logo fetch
 * (only the configured host, WebP skipped without an error) and the caption action. Nothing leaves the machine: fetch is stubbed.
 */
import { sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildImportedBundle } from '@/lib/history-import/bundle'
import { importedGameId, type ImportedGame, type MatchPlayerRow } from '@/lib/history-import/match-rows'
import { matchTables } from '@/lib/match-store/db'
import { writeBundle } from '@/lib/match-store/write'
import { playerTables } from '@/lib/players/db'
import { currentSeasonStartYear } from '@/lib/selection/season'
import { publishSheets, saveSheet } from '@/lib/selector-team-queries'
import { demoLogoPng } from '@/payload/seed/demo-png'
import { clearCollection, destroyTestPayload, getTestPayload, tokenFor } from './helpers'
import { addToSquad, makeFixture, makePlayer, makeSquad, resetSelection } from './selection-helpers'

const cache = vi.hoisted(() => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }))
vi.mock('next/cache', () => cache)
const auth = vi.hoisted(() => ({ token: '' }))
vi.mock('next/headers', () => ({ headers: async () => new Headers(auth.token ? { Authorization: `JWT ${auth.token}` } : {}), cookies: async () => ({ get: () => undefined }) }))
vi.mock('@/lib/selector-auth', async (orig) => ({ ...(await orig<typeof import('@/lib/selector-auth')>()), getSelectionUser: vi.fn(async () => null) }))

const CTX = { disableRevalidate: true } as const
const png = demoLogoPng([20, 90, 160])
const calls: string[] = []

describe('social graphics', () => {
  let payload: Payload
  let admin: string, editor: string, selector: string, disabled: string
  let riley: number, jamie: number, casey: number, near: number, juniorNear: number
  const gameId = importedGameId({ date: '2026-10-09', gradeName: 'B Grade', teamName: 'Test B', opponent: 'Rovers', gameRef: null })
  const year = currentSeasonStartYear()

  const base = 'http://localhost:3000/api/admin/social'
  const hdr = (token?: string) => (token ? { Authorization: `JWT ${token}` } : undefined)
  const graphic = async (qs: string, token?: string) => {
    const { GET } = await import('@/app/api/admin/social/graphic/route')
    return GET(new Request(`${base}/graphic?${qs}`, { headers: hdr(token) }))
  }
  const sources = async (qs: string, token?: string) => {
    const { GET } = await import('@/app/api/admin/social/sources/route')
    return GET(new Request(`${base}/sources?${qs}`, { headers: hdr(token) }))
  }
  const captionRoute = async (qs: string, token?: string) => {
    const { GET } = await import('@/app/api/admin/social/caption/route')
    return GET(new Request(`${base}/caption?${qs}`, { headers: hdr(token) }))
  }
  const dims = (buf: Buffer) => [buf.readUInt32BE(16), buf.readUInt32BE(20)]
  const enc = encodeURIComponent
  const row = (n: number, first: string, last: string, over: Partial<MatchPlayerRow>): MatchPlayerRow => ({
    row: n, firstName: first, lastName: last, nameKey: `${first}|${last}`.toLowerCase(), batted: true, runs: 0, balls: null, fours: null, sixes: null, howOut: 'bowled',
    bowlBalls: null, maidens: null, runsConceded: null, wickets: null, ...over,
  })

  beforeAll(async () => {
    payload = await getTestPayload()
    await clearCollection(payload, 'users')
    ;[admin, editor, selector] = [await tokenFor(payload, 'admin'), await tokenFor(payload, 'editor'), await tokenFor(payload, 'selector')]
    // A disabled committee member: signed in as far as the token goes, but nobody.
    disabled = await tokenFor(payload, 'editor', 'gone@example.com')
    const gone = await payload.find({ collection: 'users', where: { email: { equals: 'gone@example.com' } }, limit: 1, depth: 0 })
    await payload.update({ collection: 'users', id: gone.docs[0].id, data: { disabled: true } as never, overrideAccess: true, context: { ...CTX, seedAdmin: true } })
  }, 120_000)

  afterAll(async () => {
    vi.unstubAllGlobals()
    await resetSelection(payload)
    await clearCollection(payload, 'users')
    await clearCollection(payload, 'sponsors')
    await clearCollection(payload, 'media')
    await clearCollection(payload, 'events')
    await payload.db.drizzle.execute(sql.raw('DELETE FROM "payload"."social_settings"; DELETE FROM "payload"."throttle_hits"'))
    await destroyTestPayload(payload)
  })

  beforeEach(async () => {
    calls.length = 0
    // Stub the one outbound fetch (the sponsor logo load): the configured host serves a PNG, a WebP, or 404; any other host is a failure.
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = String(input)
      calls.push(url)
      if (!url.startsWith('http://localhost:3000/')) throw new Error(`unexpected outbound call to ${url}`)
      if (url.endsWith('.png')) return new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png' } })
      if (url.endsWith('.webp')) return new Response(new Uint8Array(png), { headers: { 'content-type': 'image/webp' } })
      return new Response('nope', { status: 404 })
    })
    await resetSelection(payload)
    await clearCollection(payload, 'sponsors')
    await clearCollection(payload, 'media')
    await clearCollection(payload, 'events')
    await payload.db.drizzle.execute(sql.raw('DELETE FROM "payload"."social_settings"; DELETE FROM "payload"."throttle_hits"'))

    riley = (await makePlayer(payload, 'Riley', 'Starr')).id
    jamie = (await makePlayer(payload, 'Jamie', 'Junior', { isJunior: true })).id
    casey = (await makePlayer(payload, 'Casey', 'Consent', { isJunior: true, socialOptIn: true })).id
    near = (await makePlayer(payload, 'Nearly', 'There', { activeOverride: 'active' })).id
    juniorNear = (await makePlayer(payload, 'Junior', 'Nearly', { activeOverride: 'active', isJunior: true })).id
    const t = playerTables(payload)
    const stamp = new Date().toISOString()
    for (const [player, runs] of [[riley, 614], [jamie, 702], [casey, 188], [near, 960], [juniorNear, 965]] as const) {
      await payload.db.drizzle.insert(t.player_seasons).values({
        player, seasonName: 'Summer 2025/26', seasonOrder: 0, teamId: 'team-b', teamName: 'Test B', gradeName: 'B Grade', games: 10, batInnings: 10, batRuns: runs, batHighScore: 112, batBalls: runs * 2,
        bowlBalls: 120, bowlRuns: 90, bowlWickets: 8, createdAt: stamp, updatedAt: stamp,
      })
    }
    const game: ImportedGame = {
      gameId, firstRow: 2, date: '2026-10-09', seasonStartYear: 2025, seasonName: 'Summer 2025/26', gradeName: 'B Grade', teamName: 'Test B', teamSlug: 'test-b', opponent: 'Rovers', gameRef: null,
      format: 'one_day', result: 'won', teamRuns: 212, teamWickets: 4, oppRuns: 160, oppWickets: 10,
      players: [
        row(2, 'Riley', 'Starr', { runs: 112, balls: 84, howOut: 'not_out', bowlBalls: 36, runsConceded: 21, wickets: 2 }),
        row(3, 'Jamie', 'Junior', { runs: 61, balls: 58, howOut: 'caught' }),
        row(4, 'Casey', 'Consent', { runs: 14, balls: 20, bowlBalls: 48, runsConceded: 30, wickets: 3 }),
      ],
    }
    await payload.db.drizzle.transaction((tx: unknown) =>
      writeBundle(tx, matchTables(payload), buildImportedBundle(game), new Map([['riley|starr', riley], ['jamie|junior', jamie], ['casey|consent', casey]]), { source: 'import', importBatch: 'imp-social-int' }),
    )
  }, 120_000)

  async function publishedTeam() {
    await makeFixture(payload, { gameId: 'game-social', localDate: '2026-10-17' })
    const squad = await makeSquad(payload, year, 'grade-b', 'B Grade')
    for (const id of [riley, jamie, casey]) await addToSquad(payload, squad.id, id)
    const selector = { id: 1, role: 'selector', collection: 'users', email: 'x@example.com' } as never
    await saveSheet(selector, { gameId: 'game-social', expectedRevision: 0, size: 11, markedReady: true, slots: [{ playerId: riley, isCaptain: true }, { playerId: jamie, isKeeper: true }, { playerId: casey }, { guestName: 'Visiting Guest' }] } as never)
    await publishSheets(selector, { gameIds: ['game-social'], announce: false, acknowledged: true })
  }

  const SOURCES: Record<string, () => string> = {
    result: () => `single|${gameId}`,
    fixtures: () => '2026-10-17',
    lineup: () => 'game-social',
    potm: () => `${gameId}|${riley}`,
    milestone: () => `${near}|runs|1000|n`,
    'stats-leaders': () => 'runs|Summer 2025/26|default|5',
    'event-promo': () => '',
    'sponsor-thanks': () => '',
    'season-wrap': () => 'summer-2025-26',
  }

  it('every graphic type draws a PNG of the stated size for the committee, in all three sizes', async () => {
    await publishedTeam()
    await makeFixture(payload, { gameId: 'game-next', localDate: '2026-10-17', opponentName: 'Next Rovers' })
    const ev = await payload.create({ collection: 'events', data: { type: 'one_time', title: 'Presentation night', description: '', location: 'Clubrooms', eventTime: '18:00', eventDate: new Date(Date.now() + 14 * 86_400_000).toISOString() } as never, overrideAccess: true, context: CTX })
    const sp = await payload.create({ collection: 'sponsors', data: { name: 'Hardware', tier: 'Platinum', linkUrl: '' } as never, overrideAccess: true, context: CTX })
    await payload.create({ collection: 'yearbooks', data: { title: 'Wrap', seasonName: 'Summer 2025/26', status: 'published', presidentMessage: '', coachMessage: '', sponsorMessage: '' } as never, overrideAccess: true, context: CTX })
    const sources2: Record<string, () => string> = { ...SOURCES, 'event-promo': () => String(ev.id), 'sponsor-thanks': () => String(sp.id) }
    for (const type of Object.keys(sources2)) {
      for (const [size, want] of [['square', [1080, 1080]], ['story', [1080, 1920]], ['landscape', [1200, 630]]] as const) {
        const res = await graphic(`type=${type}&size=${size}&style=${size === 'story' ? 'classic' : 'bold'}&source=${enc(sources2[type]())}`, editor)
        expect({ type, size, status: res.status }).toEqual({ type, size, status: 200 })
        expect(res.headers.get('content-type')).toBe('image/png')
        expect(res.headers.get('cache-control')).toBe('private, no-store')
        expect(res.headers.get('x-robots-tag')).toBe('noindex')
        expect(dims(Buffer.from(await res.arrayBuffer())), `${type} ${size}`).toEqual(want)
      }
    }
    const dl = await graphic(`type=fixtures&size=square&source=2026-10-17&download=1`, admin)
    expect(dl.headers.get('content-disposition')).toMatch(/^attachment; filename="langlang-fixtures-square-\d{4}-\d{2}-\d{2}\.png"$/)
  }, 180_000)

  it('signed out, a selector, a disabled committee member and any bad input all get the same plain 404', async () => {
    const good = `type=potm&size=square&source=${enc(`${gameId}|${riley}`)}`
    expect((await graphic(good, editor)).status).toBe(200)
    const unknown = await graphic(`type=potm&size=square&source=${enc(`nope|${riley}`)}`, editor)
    const shape = async (r: Response) => ({ status: r.status, body: await r.text(), cache: r.headers.get('cache-control'), robots: r.headers.get('x-robots-tag'), type: r.headers.get('content-type') })
    const expected = await shape(unknown)
    expect(expected.status).toBe(404)
    for (const res of [
      await graphic(good), await graphic(good, selector), await graphic(good, disabled),
      await graphic(`type=nope&size=square&source=x`, editor), await graphic(good.replace('size=square', 'size=huge'), editor), await graphic(`${good}&style=neon`, editor),
      await graphic(`type=potm&size=square&source=${enc(`${gameId}|9999999`)}`, editor),
    ]) expect(await shape(res)).toEqual(expected)
    for (const res of [await sources('type=result'), await sources('type=result', selector), await sources('type=result', disabled), await captionRoute(good), await captionRoute(good, selector)]) {
      expect(res.status).toBe(404)
    }
    expect((await sources('type=result', editor)).status).toBe(200)
  }, 60_000)

  it('a junior without the opt-in never appears in a chooser, a picker, the layout data or a result; with the opt-in they do; an adult is unaffected', async () => {
    await publishedTeam()
    const { loadGraphic } = await import('@/lib/social/pipeline')
    const { SPECS } = await import('@/lib/social/specs')
    const names = (data: unknown, type: keyof typeof SPECS) => JSON.stringify(SPECS[type].layout(data, 'bold', 'story').blocks)
    // POTM picker: Casey (opt-in) and Riley yes, Jamie no.
    const pick = await (await sources(`type=potm&game=${enc(gameId)}`, editor)).json()
    expect(pick.choices.map((c: { label: string }) => c.label).sort()).toEqual(['Casey Consent', 'Riley Starr'])
    expect(JSON.stringify(pick)).not.toContain('112') // no statistics in a chooser
    // POTM loader: the junior is a not-found, the others load.
    expect(await loadGraphic('potm', { source: `${gameId}|${jamie}` })).toBeNull()
    expect(await loadGraphic('potm', { source: `${gameId}|${casey}` })).not.toBeNull()
    expect(await loadGraphic('potm', { source: `${gameId}|${riley}` })).not.toBeNull()
    // A player who was not in this game is a not-found, even an adult.
    expect(await loadGraphic('potm', { source: `${gameId}|${near}` })).toBeNull()
    // Scorecard result: Jamie's 61 and name are absent, Casey and Riley are there.
    const card = await loadGraphic('result', { source: `scorecard|${gameId}` })
    const cardText = names(card!.data, 'result')
    expect(cardText).toContain('Riley Starr')
    expect(cardText).toContain('Casey Consent')
    expect(cardText).not.toContain('Jamie')
    // Lineup: the junior is dropped, the opted-in junior stays, the guest's name is never drawn.
    const lineup = await loadGraphic('lineup', { source: 'game-social' })
    const lineupText = names(lineup!.data, 'lineup')
    expect(lineupText).toContain('Riley Starr')
    expect(lineupText).toContain('Casey Consent')
    expect(lineupText).toContain('Guest player')
    expect(lineupText).not.toMatch(/Jamie|Visiting Guest/)
    // Leaders: Jamie has the most runs but is not on the board.
    const leaders = await loadGraphic('stats-leaders', { source: 'runs|Summer 2025/26|default|5' })
    const leaderText = names(leaders!.data, 'stats-leaders')
    expect(leaderText).toContain('Nearly There')
    expect(leaderText).not.toContain('Jamie')
    // Milestones: the adult close to 1,000 is offered, the junior is neither offered nor loadable.
    const mchoices = JSON.stringify(await (await sources('type=milestone', editor)).json())
    expect(mchoices).toContain('Nearly There')
    expect(mchoices).not.toContain('Junior Nearly')
    expect(await loadGraphic('milestone', { source: `${juniorNear}|runs|1000|n` })).toBeNull()
    expect(await loadGraphic('milestone', { source: `${near}|runs|1000|n` })).not.toBeNull()
    // An unknown claim is not drawn either: this player is not close to 5,000.
    expect(await loadGraphic('milestone', { source: `${near}|runs|5000|n` })).toBeNull()
    // Once the junior is opted in, the same player appears.
    await payload.update({ collection: 'players', id: jamie, data: { socialOptIn: true } as never, overrideAccess: true, context: CTX })
    expect(await loadGraphic('potm', { source: `${gameId}|${jamie}` })).not.toBeNull()
  }, 120_000)

  it('a hidden player is never offered or drawn', async () => {
    await payload.update({ collection: 'players', id: riley, data: { hidden: true } as never, overrideAccess: true, context: CTX })
    const { loadGraphic } = await import('@/lib/social/pipeline')
    expect(await loadGraphic('potm', { source: `${gameId}|${riley}` })).toBeNull()
    const pick = await (await sources(`type=potm&game=${enc(gameId)}`, editor)).json()
    expect(JSON.stringify(pick)).not.toContain('Riley')
  }, 60_000)

  it('the player of the match stat line is the 80-character clean text the staff member typed', async () => {
    const res = await graphic(`type=potm&size=square&source=${enc(`${gameId}|${riley}`)}&text=${enc(`${'x'.repeat(200)}\u0007`)}`, editor)
    expect(res.status).toBe(200)
    const { loadGraphic } = await import('@/lib/social/pipeline')
    const loaded = await loadGraphic('potm', { source: `${gameId}|${riley}`, text: `${'x'.repeat(200)}\u0007` })
    expect((loaded!.data as { statLine: string }).statLine).toBe('x'.repeat(80))
  }, 60_000)

  it('the caption fills the club template from the data, with the site link', async () => {
    const res = await captionRoute(`type=result&source=${enc(`single|${gameId}`)}`, editor)
    const json = await res.json()
    expect(json.text).toContain('v Rovers')
    expect(json.text).toContain('Won by 52 runs')
    expect(json.text).toMatch(/https?:\/\/[^\s]+\/matches$/)
    expect(json.unknown).toEqual([])
  }, 60_000)

  it('sponsor logos: only the configured host is fetched, a WebP is skipped without an error, and no logo at all just drops the strip', async () => {
    const mk = async (name: string, mimetype: string, file: string, tier = 'Platinum') => {
      const media = await payload.create({ collection: 'media', data: { alt: name }, file: { data: png, mimetype, name: file, size: png.length }, overrideAccess: true, context: CTX })
      await payload.create({ collection: 'sponsors', data: { name, tier, logo: media.id, linkUrl: '' } as never, overrideAccess: true, context: CTX })
    }
    await mk('Png Sponsor', 'image/png', 'logo-one.png')
    await mk('Webp Sponsor', 'image/webp', 'logo-two.webp', 'Gold')
    const { getSocialSettings, sponsorsForStrip } = await import('@/lib/social-queries')
    const strip = await sponsorsForStrip(await getSocialSettings())
    expect(strip.map((s) => s.name)).toEqual(['Png Sponsor'])
    expect(calls.length).toBeGreaterThan(0)
    for (const url of calls) expect(url.startsWith('http://localhost:3000/')).toBe(true)
    // With only the WebP left, the strip is empty and the picture still draws.
    await clearCollection(payload, 'sponsors')
    await mk('Webp Only', 'image/webp', 'logo-three.webp')
    const none = await graphic(`type=fixtures&size=square&source=2026-10-17`, editor)
    expect(none.status).toBe(200)
    // Strip switched off: no fetch at all.
    await payload.updateGlobal({ slug: 'social-settings', data: { sponsorStrip: { show: false } } as never, overrideAccess: true, context: CTX })
    calls.length = 0
    expect(await sponsorsForStrip(await getSocialSettings())).toEqual([])
    expect(calls).toEqual([])
  }, 90_000)

  it('a sponsor logo on another host is never requested', async () => {
    const { loadImageDataUri } = await import('@/lib/theme/og')
    expect(await loadImageDataUri('https://evil.example.com/x.png', 'a')).toBeNull()
    expect(await loadImageDataUri('http://127.0.0.1:9/x.png', 'b')).toBeNull()
    expect(calls).toEqual([])
    expect(await loadImageDataUri('/api/media/file/ok-one.png', 'c')).toMatch(/^data:image\/png;base64,/)
    expect(calls).toEqual(['http://localhost:3000/api/media/file/ok-one.png'])
  })

  it('social-settings over REST: nobody outside the committee reads or writes it, an editor changes only captions, an admin everything', async () => {
    const { rest } = await import('./helpers')
    expect((await rest('GET', '/globals/social-settings')).status).toBeGreaterThanOrEqual(401)
    expect((await rest('GET', '/globals/social-settings', { token: selector })).status).toBe(403)
    expect((await rest('POST', '/globals/social-settings', { token: selector, body: { signOff: 'x' } })).status).toBe(403)
    expect((await rest('POST', '/globals/social-settings', { body: { signOff: 'x' } })).status).toBe(403)
    expect((await rest('GET', '/globals/social-settings', { token: editor })).status).toBe(200)
    const ok = await rest('POST', '/globals/social-settings', { token: editor, body: { signOff: 'See you there', hashtags: [{ tag: 'club_cc' }], captionTemplates: { result: 'Final: {score}' } } })
    expect(ok.status).toBe(200)
    // Styling fields are stripped for an editor: the write succeeds but the values do not change.
    const tried = await rest('POST', '/globals/social-settings', { token: editor, body: { defaultStyle: 'minimal', showSiteHost: false, attribution: 'hack', sponsorStrip: { max: 8 } } })
    expect(tried.status).toBe(200)
    const read = (await rest('GET', '/globals/social-settings', { token: admin })).json
    expect(read).toMatchObject({ defaultStyle: 'bold', showSiteHost: true, signOff: 'See you there' })
    expect(read.attribution ?? '').toBe('')
    expect(read.sponsorStrip.max).toBe(5)
    expect(read.hashtags.map((h: { tag: string }) => h.tag)).toEqual(['club_cc'])
    expect((await rest('POST', '/globals/social-settings', { token: editor, body: { hashtags: [{ tag: 'bad tag' }] } })).status).toBe(400)
    expect((await rest('POST', '/globals/social-settings', { token: admin, body: { defaultStyle: 'classic', showSiteHost: false, attribution: 'Thanks', sponsorStrip: { max: 4 } } })).status).toBe(200)
    expect((await rest('POST', '/globals/social-settings', { token: admin, body: { defaultStyle: 'neon' } })).status).toBe(400)
    const after = (await rest('GET', '/globals/social-settings', { token: admin })).json
    expect(after).toMatchObject({ defaultStyle: 'classic', showSiteHost: false, attribution: 'Thanks' })
    // The saved default style is what an unstyled request draws, and the footer settings apply.
    expect((await graphic(`type=fixtures&size=square&source=2026-10-17`, editor)).status).toBe(200)
  }, 120_000)

  it('the caption settings action saves for the committee only and rejects bad hashtags', async () => {
    const { saveCaptionSettings } = await import('@/lib/social-actions')
    auth.token = ''
    expect(await saveCaptionSettings({ hashtags: ['a'] })).toEqual({ ok: false, error: 'Please sign in again.' })
    auth.token = selector
    expect((await saveCaptionSettings({ hashtags: ['a'] })).ok).toBe(false)
    auth.token = editor
    expect((await saveCaptionSettings({ hashtags: ['bad tag'] })).ok).toBe(false)
    expect(await saveCaptionSettings({ hashtags: ['#one', 'two'], signOff: 'Bye', captionTemplates: { fixtures: 'Games: {count}' } })).toEqual({ ok: true })
    const { getSocialSettings } = await import('@/lib/social-queries')
    const s = await getSocialSettings()
    expect(s.hashtags).toEqual(['one', 'two'])
    expect(s.signOff).toBe('Bye')
    expect(s.captionTemplates.fixtures).toBe('Games: {count}')
    auth.token = ''
  }, 60_000)

  it('the render limit stops the 301st request, lifts after the pause, and one person does not lock out another', async () => {
    const bad = `type=potm&size=square&source=${enc('nope|1')}`
    let last = 0
    for (let i = 0; i < 300; i++) last = (await graphic(bad, editor)).status
    expect(last).toBe(404)
    const blocked = await graphic(bad, editor)
    expect(blocked.status).toBe(429)
    expect(await blocked.text()).toBe('Slow down for a minute')
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(Number(blocked.headers.get('retry-after'))).toBeLessThanOrEqual(60)
    // Another committee member is unaffected.
    expect((await graphic(bad, admin)).status).toBe(404)
    // After the pause the lock is over.
    await payload.db.drizzle.execute(sql.raw(`UPDATE "payload"."throttle_hits" SET locked_until = now() - interval '1 second', count = 0, window_start = now() - interval '11 minutes'`))
    expect((await graphic(bad, editor)).status).toBe(404)
  }, 180_000)
})

