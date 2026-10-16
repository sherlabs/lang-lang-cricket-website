import { describe, expect, it } from 'vitest'
import { gameRow } from '@/lib/social/game-rows'
import { filterChoices, groupChoices, moveActive, MULTI_LIMIT, toggleMulti } from '@/lib/social/picker'
import { canShareFile, sharePayload } from '@/lib/social/share'
import { actionBarVisible, isTextInputTag, keyboardInset, keyboardOpen } from '@/lib/social/viewport'
import type { SourceChoice } from '@/lib/social/types'

const game = (id: string, o: { opp: string; round?: string | null; date: string; letter?: string; grade?: string }): SourceChoice => ({
  id, label: `${o.grade ?? 'B Grade'} v ${o.opp}`, row: gameRow({ date: o.date, grade: o.grade ?? 'B Grade', round: o.round ?? null, opposition: o.opp, letter: o.letter, clubName: 'Test CC', clubScore: '5/172', oppScore: '9/168' }, 'en-AU'),
})
const choices = [
  game('1', { opp: 'Hilltop CC', round: 'Round 14', date: '2025-10-11', letter: 'W' }),
  game('2', { opp: 'Bay Rovers', round: 'Round 14', date: '2025-10-11', letter: 'L', grade: 'A Grade' }),
  game('3', { opp: 'Hilltop CC', round: null, date: '2025-09-27', letter: 'T' }),
  { id: '9', label: 'Whole round: Sat 11 Oct (2 games)' },
]

describe('filterChoices', () => {
  it('keeps everything for an empty query', () => expect(filterChoices(choices, '  ', 'en-AU')).toHaveLength(4))
  it('finds by opposition, grade, date text and result, all words required', () => {
    expect(filterChoices(choices, 'hilltop', 'en-AU').map((c) => c.id)).toEqual(['1', '3'])
    expect(filterChoices(choices, 'rovers grade', 'en-AU').map((c) => c.id)).toEqual(['2'])
    expect(filterChoices(choices, 'september', 'en-AU').map((c) => c.id)).toEqual(['3'])
    expect(filterChoices(choices, '2025-10-11 lost', 'en-AU').map((c) => c.id)).toEqual(['2'])
    expect(filterChoices(choices, 'hilltop lost', 'en-AU')).toEqual([])
    expect(filterChoices(choices, 'whole round', 'en-AU').map((c) => c.id)).toEqual(['9'])
  })
})

describe('groupChoices', () => {
  it('groups games under their round or month in order, with plain rows first', () => {
    const g = groupChoices(choices)
    expect(g.map((x) => x.heading)).toEqual(['', 'Round 14', 'September 2025'])
    expect(g[1].choices.map((c) => c.id)).toEqual(['1', '2'])
  })
})

describe('toggleMulti', () => {
  it('adds, removes, and refuses a fifth', () => {
    let ids: string[] = []
    for (const id of ['a', 'b', 'c', 'd']) ids = toggleMulti(ids, id).ids
    expect(ids).toEqual(['a', 'b', 'c', 'd'])
    expect(MULTI_LIMIT).toBe(4)
    expect(toggleMulti(ids, 'e')).toEqual({ ids: ['a', 'b', 'c', 'd'], full: true })
    expect(toggleMulti(ids, 'b')).toEqual({ ids: ['a', 'c', 'd'], full: false })
  })
})

describe('moveActive (keyboard)', () => {
  it('moves down and up within the list, and jumps with Home and End', () => {
    expect(moveActive(-1, 'ArrowDown', 3)).toBe(0)
    expect(moveActive(0, 'ArrowDown', 3)).toBe(1)
    expect(moveActive(2, 'ArrowDown', 3)).toBe(2)
    expect(moveActive(2, 'ArrowUp', 3)).toBe(1)
    expect(moveActive(0, 'ArrowUp', 3)).toBe(0)
    expect(moveActive(1, 'End', 3)).toBe(2)
    expect(moveActive(1, 'Home', 3)).toBe(0)
    expect(moveActive(0, 'ArrowDown', 0)).toBe(-1)
  })
})

describe('share payload', () => {
  const file = new File(['x'], 'club-result-square.png', { type: 'image/png' })
  it('has exactly the files, and at most a short public title', () => {
    expect(Object.keys(sharePayload(file)).sort()).toEqual(['files'])
    expect(Object.keys(sharePayload(file, 'Round 14 results')).sort()).toEqual(['files', 'title'])
    expect(sharePayload(file, 'Round 14 results').files).toEqual([file])
    expect(sharePayload(file, '   ')).toEqual({ files: [file] })
    expect((sharePayload(file, 'x'.repeat(500)).title ?? '').length).toBe(100)
  })
  it('is offered only when the browser can share files', () => {
    expect(canShareFile(undefined, file)).toBe(false)
    expect(canShareFile({ share: async () => undefined }, file)).toBe(false)
    expect(canShareFile({ share: async () => undefined, canShare: () => false }, file)).toBe(false)
    expect(canShareFile({ share: async () => undefined, canShare: (d) => Boolean(d?.files?.length) }, file)).toBe(true)
  })
})

describe('visual viewport', () => {
  it('lifts the bar by the keyboard height and hides it while typing', () => {
    const closed = { innerHeight: 800, visualHeight: 800, visualOffsetTop: 0 }
    const open = { innerHeight: 800, visualHeight: 480, visualOffsetTop: 0 }
    expect(keyboardInset(closed)).toBe(0)
    expect(keyboardInset(open)).toBe(320)
    expect(keyboardOpen(closed)).toBe(false)
    expect(keyboardOpen(open)).toBe(true)
    // A browser toolbar collapsing is not a keyboard.
    expect(keyboardOpen({ innerHeight: 800, visualHeight: 740, visualOffsetTop: 0 })).toBe(false)
    expect(actionBarVisible(true, true)).toBe(false)
    expect(actionBarVisible(true, false)).toBe(true)
    expect(actionBarVisible(false, true)).toBe(true)
    expect(keyboardInset({ innerHeight: 800, visualHeight: 500, visualOffsetTop: 100 })).toBe(200)
  })
  it('recognises text fields', () => {
    expect(isTextInputTag('INPUT', 'text')).toBe(true)
    expect(isTextInputTag('input', 'search')).toBe(true)
    expect(isTextInputTag('input', 'checkbox')).toBe(false)
    expect(isTextInputTag('textarea')).toBe(true)
    expect(isTextInputTag('button')).toBe(false)
  })
})
