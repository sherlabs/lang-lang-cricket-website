import { describe, expect, it } from 'vitest'
import { derivePostStatus, canMove, untouched, POST_STATUSES, type TargetFacts, type TargetStatus } from '@/lib/social/status'

const now = new Date('2026-10-12T10:00:00Z')
const t = (status: TargetStatus, attempts = 0, at: string | null = null): TargetFacts => ({ status, attempts, nextAttemptAt: at ? new Date(at) : null })

describe('post moves (wave C spec 4.4)', () => {
  it('allows exactly the listed transitions', () => {
    expect(canMove('schedule', 'draft', 'scheduled')).toBe(true)
    expect(canMove('pause', 'scheduled', 'draft')).toBe(true)
    expect(canMove('claim', 'scheduled', 'publishing')).toBe(true)
    expect(canMove('finish', 'publishing', 'published')).toBe(true)
    expect(canMove('finish', 'publishing', 'failed')).toBe(true)
    expect(canMove('finish', 'publishing', 'scheduled')).toBe(true)
    expect(canMove('retry', 'failed', 'scheduled')).toBe(true)
    expect(canMove('edit', 'draft')).toBe(true)
  })
  it('refuses everything else', () => {
    for (const from of POST_STATUSES) {
      if (from !== 'draft') expect(canMove('schedule', from), `schedule from ${from}`).toBe(false)
      if (from !== 'scheduled') expect(canMove('pause', from), `pause from ${from}`).toBe(false)
      if (from !== 'scheduled') expect(canMove('claim', from), `claim from ${from}`).toBe(false)
      if (from !== 'failed') expect(canMove('retry', from), `retry from ${from}`).toBe(false)
      if (from !== 'draft') expect(canMove('edit', from), `edit from ${from}`).toBe(false)
    }
    expect(canMove('finish', 'publishing', 'draft')).toBe(false)
    expect(canMove('retry', 'published')).toBe(false)
    expect(canMove('edit', 'published')).toBe(false)
    expect(canMove('edit', 'publishing')).toBe(false)
    expect(canMove('pause', 'publishing')).toBe(false)
  })
  it('deletes only draft, posted or failed rows (a scheduled one is paused first)', () => {
    expect(POST_STATUSES.filter((s) => canMove('remove', s))).toEqual(['draft', 'published', 'failed'])
  })
  it('allows pause or edit only while no network has been tried', () => {
    expect(untouched([t('pending'), t('pending')])).toBe(true)
    expect(untouched([t('pending'), t('failed')])).toBe(false)
    expect(untouched([t('published')])).toBe(false)
  })
})

describe('derived post status', () => {
  it('is published when every target is published', () => {
    expect(derivePostStatus([t('published'), t('published')], now).status).toBe('published')
  })
  it('stays scheduled for the earliest retry while a target is pending with attempts left', () => {
    const d = derivePostStatus([t('published'), t('pending', 1, '2026-10-12T10:15:00Z'), t('pending', 1, '2026-10-12T10:05:00Z')], now)
    expect(d.status).toBe('scheduled')
    expect(d.nextRunAt?.toISOString()).toBe('2026-10-12T10:05:00.000Z')
  })
  it('is failed when something failed and nothing can be retried', () => {
    expect(derivePostStatus([t('published'), t('failed', 3)], now).status).toBe('failed')
    expect(derivePostStatus([t('failed', 1)], now).status).toBe('failed')
  })
  it('is failed (never published) while a target is unknown, whatever the others did', () => {
    expect(derivePostStatus([t('published'), t('unknown', 1)], now).status).toBe('failed')
    expect(derivePostStatus([t('unknown', 1), t('failed', 1)], now).status).toBe('failed')
  })
  it('keeps retrying other targets while one is unknown', () => {
    expect(derivePostStatus([t('unknown', 1), t('pending', 1, '2026-10-12T10:05:00Z')], now).status).toBe('scheduled')
  })
  it('treats a pending target that has used its attempts as exhausted', () => {
    expect(derivePostStatus([t('pending', 3)], now).status).toBe('failed')
  })
  it('counts a target left publishing as unknown', () => {
    expect(derivePostStatus([t('publishing', 1)], now).status).toBe('failed')
  })
  it('a post with no targets is failed', () => {
    expect(derivePostStatus([], now).status).toBe('failed')
  })
})
