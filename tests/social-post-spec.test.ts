import { describe, expect, it } from 'vitest'
import { playerNamesIn, postTitle, scheduleBlockers, validatePostInput } from '@/lib/social/post-spec'
import { FIXTURE_DATA } from './helpers/social-fixtures'

describe('player names in a picture', () => {
  it('finds the names each type draws', () => {
    expect(playerNamesIn('potm', FIXTURE_DATA.potm)).toEqual(['Alexander Montgomery-Featherstonehaugh'])
    expect(playerNamesIn('milestone', FIXTURE_DATA.milestone)).toEqual(['Alex Brown'])
    expect(playerNamesIn('stats-leaders', FIXTURE_DATA['stats-leaders'])).toHaveLength(6)
    expect(playerNamesIn('result', FIXTURE_DATA.result)).toContain('Alex Brown')
    expect(playerNamesIn('season-wrap', FIXTURE_DATA['season-wrap'])).toEqual(['Alex Brown', 'Sam Carter'])
    expect(playerNamesIn('lineup', FIXTURE_DATA.lineup)).toHaveLength(13)
  })
  it('draws no players on event, sponsor or fixture pictures', () => {
    for (const t of ['event-promo', 'sponsor-thanks', 'fixtures'] as const) expect(playerNamesIn(t, FIXTURE_DATA[t])).toEqual([])
  })
  it('skips placeholder names', () => {
    expect(playerNamesIn('lineup', { players: [{ name: 'Guest player' }, { name: 'Real Name' }] }, ['Guest player'])).toEqual(['Real Name'])
  })
  it('does not throw on odd data', () => {
    expect(playerNamesIn('potm', null)).toEqual([])
    expect(playerNamesIn('stats-leaders', { rows: 'x' })).toEqual([])
  })
  it('builds a short title', () => {
    expect(postTitle('Results', 'B Grade v Rovers').length).toBeLessThanOrEqual(120)
    expect(postTitle('Results', '')).toBe('Results')
  })
})

describe('post input', () => {
  const good = { type: 'result', source: 'single|g1', caption: ' Won! ', hashtags: ['#a', 'b'], targets: [{ network: 'mock', size: 'square' }], date: '2026-10-20', time: '18:00' }
  it('is normalised', () => {
    const r = validatePostInput(good)
    expect(r).toMatchObject({ ok: true, value: { caption: 'Won!', hashtags: ['a', 'b'], targets: [{ network: 'mock', size: 'square' }], allowOutside: false, id: null, style: null } })
  })
  it('ignores any status, creator or approver sent by the form', () => {
    const r = validatePostInput({ ...good, status: 'published', createdBy: 99, approvedBy: 99, claimToken: 'x' })
    expect(r.ok).toBe(true)
    expect(JSON.stringify(r)).not.toContain('published')
    expect(JSON.stringify(r)).not.toContain('99')
  })
  it('rejects bad types, styles, networks, sizes, duplicates and tags', () => {
    expect(validatePostInput({ ...good, type: 'nope' }).ok).toBe(false)
    expect(validatePostInput({ ...good, source: '' }).ok).toBe(false)
    expect(validatePostInput({ ...good, style: 'loud' }).ok).toBe(false)
    expect(validatePostInput({ ...good, targets: [{ network: 'myspace', size: 'square' }] }).ok).toBe(false)
    expect(validatePostInput({ ...good, targets: [{ network: 'mock', size: 'huge' }] }).ok).toBe(false)
    expect(validatePostInput({ ...good, targets: [{ network: 'mock', size: 'square' }, { network: 'mock', size: 'story' }] }).ok).toBe(false)
    expect(validatePostInput({ ...good, hashtags: ['ok', '@bad'] }).ok).toBe(false)
    expect(validatePostInput({ ...good, caption: 'a'.repeat(5001) }).ok).toBe(false)
    expect(validatePostInput(null).ok).toBe(false)
  })
})

describe('why Schedule is blocked', () => {
  const nets = [{ id: 'mock' as const, label: 'Test network' }]
  const ok = { networks: nets, selected: [{ network: 'mock' as const, size: 'square' as const }], siteUrlOk: true, captionErrors: [], timeError: null }
  it('is clear when everything holds', () => expect(scheduleBlockers(ok)).toEqual([]))
  it('says so when no network can be scheduled', () => expect(scheduleBlockers({ ...ok, networks: [], selected: [] })[0]).toMatch(/post it by hand/))
  it('asks for a network, a public address, a good caption and a time', () => {
    expect(scheduleBlockers({ ...ok, selected: [] })[0]).toMatch(/at least one/)
    expect(scheduleBlockers({ ...ok, siteUrlOk: false })[0]).toMatch(/public https/)
    expect(scheduleBlockers({ ...ok, captionErrors: ['X: too long'] })).toContain('X: too long')
    expect(scheduleBlockers({ ...ok, timeError: 'Choose a time in the future.' })).toContain('Choose a time in the future.')
  })
})
