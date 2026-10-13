/**
 * fantasy-pages.int (wave F WP-2, spec 4.9): the public pages render with the right gates and leak nothing. A wrong, rotated or
 * switched-off link and a competition with no open season are plain 404s; the pages never print a PIN, the join token or another
 * manager's squad before the lock; the leaderboard is members-only until the committee makes it public; no junior and no hidden
 * player appears; no opposition name appears.
 */
import type { Payload } from 'payload'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { signFantasyCookie, fantasyCookieName, fantasyToken } from '@/lib/fantasy/link'
import { registerEntry } from '@/lib/fantasy/join'
import { saveSquad } from '@/lib/fantasy/squads'
import { destroyTestPayload, getTestPayload, wipeTestData } from './helpers'
import { buildWorld, type World } from './fantasy-helpers'

const jar = vi.hoisted(() => ({ cookie: undefined as string | undefined }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (jar.cookie && name.endsWith('_fantasy') ? { name, value: jar.cookie } : undefined) }),
  headers: async () => new Headers(),
}))
// The stats menu is an async server component; the page tests do not need it.
vi.mock('@/components/stats/stats-sub-nav', () => ({ StatsSubNav: () => null }))
vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: <T,>(fn: () => Promise<T>) => fn }))

const text = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ')
const render = async (node: unknown) => renderToStaticMarkup(await (node as Promise<React.ReactElement>))

describe('fantasy public pages', () => {
  let payload: Payload
  let w: World
  let mine: number
  let theirs: number
  const page = async (path: 'home' | 'team' | 'leaderboard' | 'play', arg?: string, sp: Record<string, string> = {}) => {
    if (path === 'home') return render((await import('@/app/(frontend)/fantasy/page')).default())
    if (path === 'team') return render((await import('@/app/(frontend)/fantasy/team/page')).default())
    if (path === 'play') return render((await import('@/app/(frontend)/fantasy/play/[token]/page')).default({ params: Promise.resolve({ token: arg! }) }))
    return render((await import('@/app/(frontend)/fantasy/leaderboard/page')).default({ searchParams: Promise.resolve(sp) }))
  }
  const setSettings = (fantasy: Record<string, unknown>) => payload.updateGlobal({ slug: 'site-settings', data: { fantasy } as never, overrideAccess: true, context: { disableRevalidate: true } })

  beforeAll(async () => {
    payload = await getTestPayload()
    w = await buildWorld(payload)
    const ctx = { linkVersion: 1, ip: null }
    const a = await registerEntry(payload, ctx, w.season, { teamName: 'Visible Vipers', pin: '483917', again: '483917' })
    const b = await registerEntry(payload, ctx, w.season, { teamName: 'Hidden Hawks', pin: '730264', again: '730264' })
    if (!a.ok || !b.ok) throw new Error('join failed')
    mine = a.entry.id
    theirs = b.entry.id
    // The other manager saves a squad for the OPEN round; it must not show anywhere.
    const picks = Array.from({ length: 11 }, (_, i) => w.ids[`c${i + 2}`])
    expect(await saveSquad(payload, w.season, theirs, { picks, captain: w.ids.c2 })).toMatchObject({ ok: true })
    // And a past-round squad for me so the leaderboard has numbers.
    await payload.create({ collection: 'fantasy-squads', data: { entry: mine, round: w.sat1, captain: w.ids.c2, spentTenths: 0, transfersUsed: 0, picks: [w.ids.c1, w.ids.c2, w.ids.c3].map((player) => ({ player })) } as never, overrideAccess: true, context: { disableRevalidate: true, fantasyRescore: true } })
  }, 180_000)

  afterAll(async () => {
    jar.cookie = undefined
    await wipeTestData(payload)
    await destroyTestPayload(payload)
  })

  it('/fantasy is a plain 404 while the game is off, and shows the rules (never the join link) while it is on', async () => {
    await setSettings({ enabled: false })
    await expect(page('home')).rejects.toThrow()
    await setSettings({ enabled: true })
    const html = await page('home')
    const t = text(html)
    expect(t).toContain('Fantasy cricket')
    expect(t).toContain('Join with the link your club shared')
    expect(html).not.toContain(fantasyToken(1))
    expect(html).not.toContain('/fantasy/play/')
    expect(t).toMatch(/2 teams have joined/)
  })

  it('the join page is a 404 for a wrong or rotated link, and shows the neutral warning for the right one', async () => {
    await expect(page('play', 'x'.repeat(43))).rejects.toThrow()
    await expect(page('play', fantasyToken(2))).rejects.toThrow()
    const t = text(await page('play', fantasyToken(1)))
    expect(t).toContain('Do not use a surname')
    expect(t).toContain('We store your team name and a scrambled copy of your PIN')
  })

  it('without the cookie /fantasy/team shows no player list; with it, the team and a picker, never another squad or a PIN', async () => {
    jar.cookie = undefined
    const anon = text(await page('team'))
    expect(anon).toContain('Open the link your club shared')
    expect(anon).not.toContain('Player2 Test2')
    jar.cookie = signFantasyCookie({ entryId: mine, linkVersion: 1, iat: Date.now() })
    const html = await page('team')
    const t = text(html)
    expect(t).toContain('Visible Vipers')
    expect(t).toContain('Save squad')
    expect(t).toContain('Player1 Test1')
    expect(t).toContain('Player12 Test12')
    // No junior, no hidden player, no PIN field values, no join token, no other team.
    expect(t).not.toContain('Player13 Test13')
    expect(t).not.toContain('Player14 Test14')
    expect(t).not.toContain('Hidden Hawks')
    expect(html).not.toContain(fantasyToken(1))
    expect(html).not.toMatch(/pinHash|pinSalt|deviceCode/)
    // My team has no squad for the open round, the other manager's picks are not mine.
    const { getTeamView } = await import('@/lib/fantasy/queries')
    const { getFantasySettings, getEntry } = await import('@/lib/fantasy/store')
    const view = await getTeamView(await getFantasySettings(payload), w.season, (await getEntry(payload, w.season.id, mine))!)
    expect(view.picks).toEqual([w.ids.c1, w.ids.c2, w.ids.c3])
    expect(view.pool.map((p) => p.id)).not.toContain(w.ids.c13)
    expect(view.pool.map((p) => p.id)).not.toContain(w.ids.c14)
    // A remembered device from before a rotation is signed out.
    jar.cookie = signFantasyCookie({ entryId: mine, linkVersion: 5, iat: Date.now() })
    expect(text(await page('team'))).toContain('Open the link your club shared')
    jar.cookie = undefined
  })

  it('the leaderboard is for members only until the committee makes it public, then shows team names and points', async () => {
    await setSettings({ publicLeaderboard: false })
    expect(text(await page('leaderboard'))).toContain('The leaderboard is shared with members who have joined.')
    expect(text(await page('leaderboard'))).not.toContain('Visible Vipers')
    jar.cookie = signFantasyCookie({ entryId: mine, linkVersion: 1, iat: Date.now() })
    expect(text(await page('leaderboard'))).toContain('Visible Vipers')
    jar.cookie = undefined
    await setSettings({ publicLeaderboard: true })
    const html = await page('leaderboard')
    const t = text(html)
    expect(t).toContain('Visible Vipers')
    expect(t).toContain('Hidden Hawks')
    expect(t).toContain('How points are scored')
    // Three picks of the first weekend: c1 -1, c2 (captain) 2 x 36, c3 14 = 85; the other team has no past squad.
    expect(t).toMatch(/Visible Vipers[^A-Za-z]*85/)
    // The open round's squads are not on it, and nothing names an opposition player, a junior or a hidden player.
    expect(t).not.toContain('Opp o1')
    expect(t).not.toContain('Player13')
    expect(t).not.toContain('Player14')
    expect(html).not.toContain(fantasyToken(1))
    // A bad round filter is just the season view.
    expect(text(await page('leaderboard', undefined, { round: 'nonsense' }))).toContain('Visible Vipers')
    expect(text(await page('leaderboard', undefined, { round: w.sat1 }))).toContain('85')
  })

  it('every page is a plain 404 once the season is closed', async () => {
    await payload.update({ collection: 'fantasy-seasons', id: w.season.id, data: { status: 'closed' }, overrideAccess: true, context: { disableRevalidate: true } })
    await expect(page('home')).rejects.toThrow()
    await expect(page('leaderboard')).rejects.toThrow()
    await expect(page('team')).rejects.toThrow()
    await expect(page('play', fantasyToken(1))).rejects.toThrow()
    void fantasyCookieName
  })
})
