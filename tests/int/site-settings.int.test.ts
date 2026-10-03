import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { destroyTestPayload, getTestPayload, resetGlobal, rest, tokenFor } from './helpers'

// Spec §15: sponsor-carousel-actions → site-settings.int.
describe('site-settings global', () => {
  let payload: Payload
  let editor: string

  beforeAll(async () => {
    payload = await getTestPayload()
    await resetGlobal(payload, 'site-settings')
    editor = await tokenFor(payload, 'editor')
  })

  afterAll(async () => {
    await resetGlobal(payload, 'site-settings')
    await destroyTestPayload(payload)
  })

  it('defaults to Platinum + Gold before anyone saves', async () => {
    const { getSponsorCarouselTiers } = await import('@/lib/site-settings')
    expect(await getSponsorCarouselTiers()).toEqual(['Platinum', 'Gold'])
  })

  it('anonymous users can read but not update', async () => {
    expect((await rest('GET', '/globals/site-settings')).status).toBe(200)
    expect((await rest('POST', '/globals/site-settings', { body: { sponsorCarouselTiers: [] } })).status).toBe(403)
  })

  it('an editor saves tiers; readers get them in tier order', async () => {
    const res = await rest('POST', '/globals/site-settings', { token: editor, body: { sponsorCarouselTiers: ['Silver', 'Platinum'] } })
    expect(res.status).toBe(200)
    const { getSponsorCarouselTiers } = await import('@/lib/site-settings')
    expect(await getSponsorCarouselTiers()).toEqual(['Platinum', 'Silver'])
  })

  it('a saved empty list hides the carousel', async () => {
    await rest('POST', '/globals/site-settings', { token: editor, body: { sponsorCarouselTiers: [] } })
    const { getSponsorCarouselTiers } = await import('@/lib/site-settings')
    expect(await getSponsorCarouselTiers()).toEqual([])
  })

  it('rejects an unknown tier', async () => {
    const res = await rest('POST', '/globals/site-settings', { token: editor, body: { sponsorCarouselTiers: ['Diamond'] } })
    expect(res.status).toBe(400)
  })
})
