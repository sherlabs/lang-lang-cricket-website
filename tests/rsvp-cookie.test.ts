import { describe, it, expect } from 'vitest'
import {
  RSVP_COOKIE_MAX_ENTRIES,
  parseRsvpCookie,
  removeRsvpToken,
  rsvpKey,
  serializeRsvpCookie,
  upsertRsvpMemory,
} from '@/lib/rsvp-cookie'

const details = { name: 'Pat', email: 'pat@example.com' }

describe('rsvpKey', () => {
  it('joins event id and the occurrence ISO string', () => {
    expect(rsvpKey(7, new Date('2026-10-08T18:00:00.000Z'))).toBe('7:2026-10-08T18:00:00.000Z')
  })
})

describe('parseRsvpCookie', () => {
  it('treats missing, malformed and wrong-shaped values as empty', () => {
    expect(parseRsvpCookie(undefined)).toEqual({ name: '', email: '', rsvps: {} })
    expect(parseRsvpCookie('')).toEqual({ name: '', email: '', rsvps: {} })
    expect(parseRsvpCookie('{not json')).toEqual({ name: '', email: '', rsvps: {} })
    expect(parseRsvpCookie('[1,2]')).toEqual({ name: '', email: '', rsvps: {} })
    expect(parseRsvpCookie('"str"')).toEqual({ name: '', email: '', rsvps: {} })
    // The pre-poll single-RSVP cookie shape has no `rsvps` map — also empty.
    expect(parseRsvpCookie(JSON.stringify({ eventTitle: 'x', editToken: 'tok' }))).toEqual({ name: '', email: '', rsvps: {} })
  })

  it('drops non-string tokens and non-string name/email but keeps the rest', () => {
    const raw = JSON.stringify({ name: 42, email: 'a@b.c', rsvps: { '1:x': 'tok', '2:y': 3, '3:z': '' } })
    expect(parseRsvpCookie(raw)).toEqual({ name: '', email: 'a@b.c', rsvps: { '1:x': 'tok' } })
  })

  it('round-trips through serialize preserving entry order', () => {
    let memory = parseRsvpCookie(undefined)
    memory = upsertRsvpMemory(memory, '1:2026-10-01T18:00:00.000Z', 'a', details)
    memory = upsertRsvpMemory(memory, '2:2026-10-02T18:00:00.000Z', 'b', details)
    const back = parseRsvpCookie(serializeRsvpCookie(memory))
    expect(back).toEqual(memory)
    expect(Object.keys(back.rsvps)).toEqual(['1:2026-10-01T18:00:00.000Z', '2:2026-10-02T18:00:00.000Z'])
  })
})

describe('upsertRsvpMemory', () => {
  it('adds a new entry and remembers name/email', () => {
    const memory = upsertRsvpMemory({ name: '', email: '', rsvps: {} }, '1:x', 'tok', details)
    expect(memory).toEqual({ name: 'Pat', email: 'pat@example.com', rsvps: { '1:x': 'tok' } })
  })

  it('re-voting the same key replaces the token and moves it to newest', () => {
    let memory = upsertRsvpMemory({ name: '', email: '', rsvps: {} }, '1:x', 'a', details)
    memory = upsertRsvpMemory(memory, '2:y', 'b', details)
    memory = upsertRsvpMemory(memory, '1:x', 'a2', details)
    expect(Object.entries(memory.rsvps)).toEqual([
      ['2:y', 'b'],
      ['1:x', 'a2'],
    ])
  })

  it('caps at the max entries, dropping the oldest first', () => {
    let memory = { name: '', email: '', rsvps: {} as Record<string, string> }
    for (let i = 0; i < RSVP_COOKIE_MAX_ENTRIES; i++) memory = upsertRsvpMemory(memory, `${i}:d`, `t${i}`, details)
    expect(Object.keys(memory.rsvps)).toHaveLength(RSVP_COOKIE_MAX_ENTRIES)
    memory = upsertRsvpMemory(memory, 'new:d', 'tnew', details)
    const keys = Object.keys(memory.rsvps)
    expect(keys).toHaveLength(RSVP_COOKIE_MAX_ENTRIES)
    expect(keys[0]).toBe('1:d')
    expect(keys[keys.length - 1]).toBe('new:d')
    expect(memory.rsvps['0:d']).toBeUndefined()
  })

  it('does not mutate its input', () => {
    const before = { name: '', email: '', rsvps: { '1:x': 'a' } }
    upsertRsvpMemory(before, '2:y', 'b', details)
    expect(before.rsvps).toEqual({ '1:x': 'a' })
  })
})

describe('removeRsvpToken', () => {
  it('removes every entry holding the token and keeps the rest', () => {
    const memory = { name: 'Pat', email: '', rsvps: { '1:x': 'a', '2:y': 'b' } }
    expect(removeRsvpToken(memory, 'a')).toEqual({ name: 'Pat', email: '', rsvps: { '2:y': 'b' } })
    expect(removeRsvpToken(memory, 'zzz')).toEqual(memory)
  })
})
