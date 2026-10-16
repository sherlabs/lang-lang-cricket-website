/**
 * yearbook-match.int (W2 spec 5.5): the match-data sections appear on a published yearbook when the season has
 * stored matches and are absent without them; results use stored scorecards only when every finished game is
 * stored; a draft yearbook is still a 404. PlayHQ is mocked: no live call is made.
 */
import type { Payload } from 'payload'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Game } from '@/lib/playhq/types'
import { generateMatchSeed } from '../../payload/scripts/fixtures/match-seed-data'
import { seedMatchSeasonRows, seedMatchStore } from '../../payload/scripts/fixtures/match-seed-db'
import { clearCollection, destroyTestPayload, getTestPayload, resetGlobal } from './helpers'
import { resetMatches } from './match-helpers'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: <T,>(fn: () => Promise<T>) => fn }))
const live = vi.hoisted(() => ({ value: { status: 'none' } as { status: string; games?: unknown[] } }))
vi.mock('@/lib/matches-queries', async (orig) => ({ ...(await orig<typeof import('@/lib/matches-queries')>()), loadGamesForSeasonName: async () => live.value }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))

const ORG = '484ced51-403a-466c-9a94-bd95eedf7319'
const SEASON = 'Summer 2025/26'
let payload: Payload

const text = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/\s+/g, ' ')
const page = async (slug: string) => {
  const { default: Page } = await import('@/app/(frontend)/yearbooks/[slug]/page')
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ slug }) }))
  return { html, text: text(html) }
}
const finalIds = () => generateMatchSeed(ORG).filter((g) => g.seasonName === SEASON && g.raw.status === 'FINAL' && !g.raw.teams.every((t) => t.organisation.id === ORG)).map((g) => g.raw.id)
const fakeGame = (id: string, o: Partial<Game> = {}) =>
  ({ id, status: 'FINAL', gradeName: 'A Grade', sortKey: '2025-10-01T00:00:00', localDate: '2025-10-01', url: '', updatedAt: null, gradeId: 'g', roundName: 'R1', roundAbbr: 'R1', isFinalRound: false, localTime: null, venueName: null, venueSuburb: null, isClubDerby: false,
    club: { id: 'c', name: 'Club A', isHome: true, outcome: 'WON', score: 1 }, opponent: { id: 'o', name: 'Opp', isHome: false, outcome: 'LOST', score: 2 }, ...o }) as unknown as Game

beforeAll(async () => {
  payload = await getTestPayload()
  await resetGlobal(payload, 'site-settings')
  await resetMatches(payload)
  await clearCollection(payload, 'yearbooks')
}, 120_000)
afterAll(async () => {
  await clearCollection(payload, 'yearbooks')
  await resetMatches(payload)
  await resetGlobal(payload, 'site-settings')
  await destroyTestPayload(payload)
})
beforeEach(async () => {
  await clearCollection(payload, 'yearbooks')
  live.value = { status: 'none' }
})

const publish = (status: 'published' | 'draft' = 'published', seasonName = SEASON) =>
  payload.create({ collection: 'yearbooks', data: { title: 'Book', seasonName, status } as never, context: { disableRevalidate: true } })

describe('without stored matches', () => {
  it('shows none of the match-data sections and still renders', async () => {
    const y = await publish()
    const { text: t } = await page(y.slug as string)
    for (const heading of ['Win and loss progression', 'Partnership records', 'Season highlights', 'stored scorecards']) expect(t).not.toContain(heading)
  })
})

describe('with stored matches', () => {
  beforeAll(async () => {
    await seedMatchStore(payload, { clubOrgId: ORG })
    await seedMatchSeasonRows(payload, ORG)
  }, 180_000)

  it('shows results with scores, the progression SVG with letters, partnerships and highlights', async () => {
    const y = await publish()
    const { html, text: t } = await page(y.slug as string)
    expect(t).toContain('Results by grade')
    expect(t).toContain('Scores and results from the stored scorecards')
    expect(t).toMatch(/\d+\/\d+ \(\d+\.\d ov\)/)
    expect(t).toContain('Win and loss progression')
    expect(html).toContain('role="img"')
    expect(html).toMatch(/>W<\/text>/)
    expect(t).toContain('Partnership records')
    expect(t).toContain('inferred')
    expect(t).toContain('Season highlights')
    expect(t).toContain('not club honours')
    expect(t).toContain('from match data')
    expect(t).toContain('from season totals')
    expect(t).toMatch(/games stored/)
    // Never a hex literal and never the existing data-mix: the all-rounder blocks are labelled apart.
    expect(html).not.toMatch(/#[0-9a-fA-F]{6}\b/)
  })

  it('uses stored scores only when every finished live game is stored, naming the share otherwise', async () => {
    const y = await publish()
    live.value = { status: 'ok', games: finalIds().map((id) => fakeGame(id)) }
    expect((await page(y.slug as string)).text).toContain('Scores and results from the stored scorecards')
    live.value = { status: 'ok', games: [...finalIds().map((id) => fakeGame(id)), fakeGame('not-stored')] }
    const incomplete = (await page(y.slug as string)).text
    expect(incomplete).not.toContain('Scores and results from the stored scorecards')
    expect(incomplete).toContain('Results from the fixtures list')
    expect(incomplete).toMatch(/used only when every finished game is stored\. \d+ of \d+ finished games stored\./)
    // The progression and records still show, captioned with the same share.
    expect(incomplete).toContain('Win and loss progression')
  })

  it('a draft yearbook is still a 404, and a season with no stored matches has no match sections', async () => {
    const draft = await publish('draft')
    await expect(page(draft.slug as string)).rejects.toThrow('NEXT_NOT_FOUND')
    const other = await publish('published', 'Summer 2030/31')
    const { text: t } = await page(other.slug as string)
    expect(t).not.toContain('Win and loss progression')
  })
})
