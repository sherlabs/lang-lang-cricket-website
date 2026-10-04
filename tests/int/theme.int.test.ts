/**
 * theme.int (WP-T): the `theme` global through the Local API and REST. Saving a palette is reflected by
 * getTheme(); invalid hex and failing contrast pairs are rejected by the hooks; editors cannot update it;
 * seedThemeGlobal is skip-if-saved; with no row the seed renders.
 */
import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { seedThemeGlobal } from '@/payload/seed/seed-theme-global'
import { destroyTestPayload, getTestPayload, resetGlobal, rest, tokenFor } from './helpers'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

let payload: Payload
let editor: string
let admin: string

/** The ValidationError's per-field messages (the thrown `.message` only lists the field paths). */
const failures = async (data: Record<string, unknown>) => {
  try {
    await save(data)
  } catch (e) {
    return (e as { data?: { errors: { path: string; message: string }[] } }).data?.errors ?? []
  }
  return []
}

const save = (data: Record<string, unknown>, overrideAccess = true) =>
  payload.updateGlobal({ slug: 'theme', data: data as never, overrideAccess, context: { disableRevalidate: true } })

/** getTheme() is React-cache()d per request; outside one, each call re-reads. */
const theme = async () => (await import('@/lib/theme')).getTheme()

beforeAll(async () => {
  payload = await getTestPayload()
  editor = await tokenFor(payload, 'editor')
  admin = await tokenFor(payload, 'admin')
})
beforeEach(async () => {
  await resetGlobal(payload, 'theme')
})
afterAll(async () => {
  await resetGlobal(payload, 'theme')
  await destroyTestPayload(payload)
})

describe('theme global', () => {
  it('with no saved row the seed renders (zero-touch deploy)', async () => {
    const t = await theme()
    expect(t.colors.gold).toBe('#F5B700')
    expect(t.font.key).toBe('barlow-condensed')
    // No theme crest: the chain falls to the legacy Club details logo (whatever earlier tests left), else the bundled crest.
    expect(t.crest.url).toBe((await (await import('@/lib/club')).getClub()).logoUrl)
  })

  it('a saved palette is reflected by getTheme()', async () => {
    await save({ palette: { accent: '#4b96f0' }, headingFont: 'oswald' })
    const t = await theme()
    expect(t.colors.gold).toBe('#4B96F0')
    expect(t.channels.gold).toBe('75 150 240')
    expect(t.font.key).toBe('oswald')
    expect(t.colors.black).toBe('#0B0B0D')
  })

  it('expands a three-digit hex and stores upper-case', async () => {
    const saved = await save({ shades: { ink: '#123' } })
    expect(saved.shades.ink).toBe('#112233')
  })

  it('rejects an invalid hex', async () => {
    await expect(save({ palette: { accent: 'gold' } })).rejects.toThrow(/six hex digits|invalid/i)
    await expect(save({ palette: { accent: '#12345' } })).rejects.toThrow()
  })

  it('rejects a failing contrast pair with a plain message, and saves nothing', async () => {
    const errors = await failures({ palette: { text: '#CCCCCC' } })
    expect(errors.some((e) => e.path === 'palette.text' && /contrast .* needs at least 4\.5/.test(e.message))).toBe(true)
    expect((await payload.findGlobal({ slug: 'theme', overrideAccess: true })).updatedAt).toBeFalsy()
  })

  it('checks a change against the saved colours, not just the new field', async () => {
    await save({ palette: { surface: '#FFFFFF' } })
    // text on the (now white) surface is fine; making the surface dark must fail against the saved text colour
    const errors = await failures({ palette: { surface: '#202020' } })
    expect(errors.map((e) => e.path)).toContain('palette.text')
  })

  it('only admins can update it over REST; anyone can read it', async () => {
    expect((await rest('GET', '/globals/theme')).status).toBe(200)
    expect((await rest('POST', '/globals/theme', { body: { palette: { accent: '#4B96F0' } } })).status).toBe(403)
    expect((await rest('POST', '/globals/theme', { token: editor, body: { palette: { accent: '#4B96F0' } } })).status).toBe(403)
    expect((await rest('POST', '/globals/theme', { token: admin, body: { palette: { accent: '#4B96F0' } } })).status).toBe(200)
    // the Local API with overrideAccess: false refuses a user without the admin role too
    const user = (await payload.find({ collection: 'users', where: { role: { equals: 'editor' } }, limit: 1, overrideAccess: true })).docs[0]
    await expect(payload.updateGlobal({ slug: 'theme', data: { headingFont: 'anton' } as never, user, overrideAccess: false })).rejects.toThrow()
  })

  it('seedThemeGlobal is skip-if-saved, and force overwrites', async () => {
    expect(await seedThemeGlobal(payload)).toBe('created')
    await save({ palette: { accent: '#4B96F0' } })
    expect(await seedThemeGlobal(payload)).toBe('skipped')
    expect((await theme()).colors.gold).toBe('#4B96F0')
    expect(await seedThemeGlobal(payload, { force: true })).toBe('updated')
    expect((await theme()).colors.gold).toBe('#F5B700')
  })

  it('the blue sample palette saves (it passes the contrast hook)', async () => {
    expect(await seedThemeGlobal(payload, { sample: 'blue', force: true })).toBe('created')
    const t = await theme()
    expect(t.colors.gold).toBe('#4B96F0')
    expect(t.font.key).toBe('oswald')
  })
})
