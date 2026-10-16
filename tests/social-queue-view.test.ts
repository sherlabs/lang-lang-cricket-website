import { describe, expect, it } from 'vitest'
import { needsFallback, NOT_AVAILABLE, postChip, tabOf, targetLine } from '@/lib/social/queue-view'

const o = { label: 'X', maxAttempts: 3, clock: () => '6:45 pm' }
const t = (over: Partial<Parameters<typeof targetLine>[0]> = {}) => ({ status: 'pending', attempts: 0, nextAttemptAt: null, errorCode: null, lastError: null, manual: false, ...over })

describe('queue words', () => {
  it('uses the plain names for states, with an icon and a word', () => {
    expect(postChip('scheduled').label).toBe('Scheduled')
    expect(postChip('publishing').label).toBe('Posting now')
    expect(postChip('published').label).toBe('Posted')
    expect(postChip('failed').label).toBe('Did not post')
    for (const s of ['scheduled', 'publishing', 'published', 'failed', 'draft']) expect(postChip(s).icon.length).toBeGreaterThan(0)
  })
  it('describes each network in a sentence', () => {
    expect(targetLine(t({ status: 'published' }), o)).toBe('X: posted')
    expect(targetLine(t({ status: 'published', manual: true }), o)).toBe('X: posted by hand')
    expect(targetLine(t({ status: 'pending', attempts: 2, nextAttemptAt: '2026-10-12T08:45:00Z' }), o)).toBe('X: did not post, will retry at 6:45 pm (attempt 2 of 3)')
    expect(targetLine(t({ status: 'failed', errorCode: 'media_rejected' }), { ...o, label: 'Instagram' })).toBe('Instagram: did not post: The network could not use the picture.')
    expect(targetLine(t({ status: 'unknown' }), o)).toBe('X: Not sure it went out. Check the page.')
    expect(targetLine(t({ status: 'failed', errorCode: 'content_changed' }), o)).toContain("A player's details changed")
  })
  it('puts a post on the right tab', () => {
    expect(tabOf({ status: 'failed', targets: [] })).toBe('attention')
    expect(tabOf({ status: 'scheduled', targets: [{ status: 'pending' }, { status: 'unknown' }] })).toBe('attention')
    expect(tabOf({ status: 'scheduled', targets: [{ status: 'pending' }] })).toBe('scheduled')
    expect(tabOf({ status: 'publishing', targets: [] })).toBe('scheduled')
    expect(tabOf({ status: 'published', targets: [{ status: 'published' }] })).toBe('posted')
    expect(tabOf({ status: 'draft', targets: [] })).toBe('drafts')
  })
  it('always offers the by-hand fallback for a target that did not go out or has no connection', () => {
    expect(needsFallback({ status: 'failed' }, true)).toBe(true)
    expect(needsFallback({ status: 'unknown' }, true)).toBe(true)
    expect(needsFallback({ status: 'pending' }, false)).toBe(true)
    expect(needsFallback({ status: 'pending' }, true)).toBe(false)
    expect(needsFallback({ status: 'published' }, false)).toBe(false)
    expect(NOT_AVAILABLE('Facebook')).toBe('Facebook is not available yet. Download the picture and post it by hand.')
  })
})
