import type { Payload } from 'payload'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearCollection, destroyTestPayload, getTestPayload, tokenFor } from './helpers'
import { resetSelection } from './selection-helpers'
import { cookieFor, makeFinalGame, makeTeam, votesOn } from './votes-helpers'
import { writeBallot } from '@/lib/votes-queries'
import { linkToken } from '@/lib/availability-link'

const cache = vi.hoisted(() => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }))
vi.mock('next/cache', () => cache)
const ctl = vi.hoisted(() => ({ headers: new Headers(), cookie: undefined as string | undefined }))
vi.mock('next/headers', () => ({ headers: async () => ctl.headers, cookies: async () => ({ get: () => (ctl.cookie ? { value: ctl.cookie } : undefined), set: () => undefined }) }))
vi.mock('next/navigation', async (orig) => ({
  ...(await orig<typeof import('next/navigation')>()),
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`)
  },
}))

/** The selector vote pages render for a signed-in selector and send everyone else to sign in. */
describe('vote pages in the selector area and the availability link', () => {
  let payload: Payload
  let team: { id: number; name: string }[]
  let game: { id: number }
  let selectorToken: string
  let adminToken: string

  beforeAll(async () => {
    payload = await getTestPayload()
    await clearCollection(payload, 'users')
    selectorToken = await tokenFor(payload, 'selector')
    adminToken = await tokenFor(payload, 'admin')
  })
  afterAll(async () => {
    await resetSelection(payload)
    await clearCollection(payload, 'users')
    await destroyTestPayload(payload)
  })
  beforeEach(async () => {
    await resetSelection(payload)
    team = await makeTeam(payload, 8)
    game = await makeFinalGame(payload, team.map((p) => p.id), { daysAgo: 2 })
    await votesOn(payload)
    for (let i = 0; i < 4; i++) await writeBallot(payload, { fixtureId: game.id, voterKey: `player:${team[3 + i].id}`, voterPlayerId: team[3 + i].id, picks: [{ place: 1, playerId: team[0].id }, { place: 2, playerId: team[1].id }, { place: 3, playerId: team[2].id }], source: 'voter', castBy: null })
    ctl.headers = new Headers()
    ctl.cookie = undefined
  })

  const asSelector = () => {
    ctl.headers = new Headers({ Authorization: `JWT ${selectorToken}` })
  }
  const html = async (el: Promise<React.ReactElement> | React.ReactElement) => renderToStaticMarkup(await el)

  it('every selector vote page sends an anonymous visitor to sign in', async () => {
    const home = (await import('@/app/(frontend)/selector/(area)/votes/page')).default
    const detail = (await import('@/app/(frontend)/selector/(area)/votes/[fixtureId]/page')).default
    const settings = (await import('@/app/(frontend)/selector/(area)/votes/settings/page')).default
    const present = (await import('@/app/(frontend)/selector/present/votes/page')).default
    await expect(home({ searchParams: Promise.resolve({}) })).rejects.toThrow(/REDIRECT \/selector\/login/)
    await expect(detail({ params: Promise.resolve({ fixtureId: String(game.id) }) })).rejects.toThrow(/REDIRECT \/selector\/login/)
    await expect(settings()).rejects.toThrow(/REDIRECT \/selector\/login/)
    await expect(present({ searchParams: Promise.resolve({}) })).rejects.toThrow(/REDIRECT \/selector\/login/)
  })

  it('renders the games, the private leaderboard and the participation for a selector', async () => {
    asSelector()
    const home = (await import('@/app/(frontend)/selector/(area)/votes/page')).default
    const out = await html(home({ searchParams: Promise.resolve({}) }))
    expect(out).toContain('4 of 8 voted')
    expect(out).toContain('Counts')
    expect(out).toContain('Leaderboard (private)')
    expect(out).not.toContain('Download totals') // CSV is admin only
    const detail = (await import('@/app/(frontend)/selector/(area)/votes/[fixtureId]/page')).default
    const page = await html(detail({ params: Promise.resolve({ fixtureId: String(game.id) }) }))
    expect(page).toContain('Not voted yet (4)')
    expect(page).toContain('This shows who has voted, never who they voted for.')
    expect(page).toContain('Enter a ballot')
    expect(page).not.toContain('Admin: voters and disputes')
    await expect(detail({ params: Promise.resolve({ fixtureId: '999999' }) })).rejects.toMatchObject({ digest: expect.stringContaining('404') })
  })

  it('the admin sees the CSV link and the dispute panel', async () => {
    ctl.headers = new Headers({ Authorization: `JWT ${adminToken}` })
    const home = (await import('@/app/(frontend)/selector/(area)/votes/page')).default
    expect(await html(home({ searchParams: Promise.resolve({}) }))).toContain('Download totals')
    const detail = (await import('@/app/(frontend)/selector/(area)/votes/[fixtureId]/page')).default
    expect(await html(detail({ params: Promise.resolve({ fixtureId: String(game.id) }) }))).toContain('Admin: voters and disputes')
  })

  it('the settings page is read only for a selector', async () => {
    asSelector()
    const settings = (await import('@/app/(frontend)/selector/(area)/votes/settings/page')).default
    const out = await html(settings())
    expect(out).toContain('Only the committee (admins and editors) can change these settings.')
    expect(out).not.toContain('Save settings')
  })

  it('awards night mode renders the title step and refuses to show anything while voting is off', async () => {
    asSelector()
    const present = (await import('@/app/(frontend)/selector/present/votes/page')).default
    const out = await html(present({ searchParams: Promise.resolve({}) }))
    expect(out).toContain('Step 1 of')
    expect(out).toContain('awards')
    await payload.updateGlobal({ slug: 'selection-settings', data: { votes: { enabled: false } } as never, overrideAccess: true, context: { disableRevalidate: true } })
    expect(await html(present({ searchParams: Promise.resolve({}) }))).toContain('nothing to present')
  })

  it('the Overview lists the votes tile only while voting is on', async () => {
    asSelector()
    const overview = (await import('@/app/(frontend)/selector/(area)/page')).default
    expect(await html(overview({ searchParams: Promise.resolve({}) }))).toContain('1 game is open for voting')
    await payload.updateGlobal({ slug: 'selection-settings', data: { votes: { enabled: false } } as never, overrideAccess: true, context: { disableRevalidate: true } })
    expect(await html(overview({ searchParams: Promise.resolve({}) }))).not.toContain('open for voting')
  })

  it('the availability page lists the game to vote on for an identified player and the vote page shows the ballot form', async () => {
    const page = (await import('@/app/(frontend)/availability/[token]/page')).default
    const token = linkToken(1)
    ctl.cookie = cookieFor(team[0].id)
    const out = await html(page({ params: Promise.resolve({ token }) }))
    expect(out).toContain('Vote for best player')
    expect(out).toContain(`/availability/${token}/vote/${game.id}`)
    const vote = (await import('@/app/(frontend)/availability/[token]/vote/[fixtureId]/page')).default
    const form = await html(vote({ params: Promise.resolve({ token, fixtureId: String(game.id) }), searchParams: Promise.resolve({}) }))
    expect(form.match(/<select/g)).toHaveLength(3)
    expect(form).toContain('Send my vote')
    // a player who was not in the game sees no card
    ctl.cookie = cookieFor((await payload.create({ collection: 'players', data: { firstName: 'Out', lastName: 'Sider' } as never, overrideAccess: true, context: { disableRevalidate: true } })).id)
    expect(await html(page({ params: Promise.resolve({ token }) }))).not.toContain('Vote for best player')
  })

  it('the vote action sends the result back as a short code and never trusts form fields for who is voting', async () => {
    const { castVoteAction } = await import('@/app/(frontend)/availability/[token]/vote/[fixtureId]/actions')
    const token = linkToken(1)
    const fd = (picks: number[], extra: Record<string, string> = {}) => {
      const f = new FormData()
      f.set('token', token)
      f.set('fixtureId', String(game.id))
      picks.forEach((p, i) => f.set(`place_${i + 1}`, String(p)))
      for (const [k, v] of Object.entries(extra)) f.set(k, v)
      return f
    }
    ctl.cookie = cookieFor(team[0].id)
    await expect(castVoteAction(fd([team[1].id, team[2].id, team[3].id], { playerId: String(team[5].id), voterKey: `player:${team[5].id}` }))).rejects.toThrow(/REDIRECT .*\?saved=1/)
    const mine = await payload.find({ collection: 'best-player-ballots', where: { voterKey: { equals: `player:${team[0].id}` } }, overrideAccess: true, depth: 0 })
    expect(mine.docs).toHaveLength(1)
    expect((await payload.count({ collection: 'best-player-ballots', where: { voterKey: { equals: `player:${team[5].id}` } }, overrideAccess: true })).totalDocs).toBe(1) // team[5] already had their seeded ballot
    await expect(castVoteAction(fd([team[1].id, team[1].id, team[3].id]))).rejects.toThrow(/REDIRECT .*\?e=duplicate/)
    ctl.cookie = undefined
    await expect(castVoteAction(fd([team[1].id, team[2].id, team[3].id]))).rejects.toThrow(/REDIRECT .*\?e=unavailable/)
  })
})
