import { describe, expect, it } from 'vitest'
import { duplicateUrlIds, expectedRows } from '@/payload/scripts/etl/rules'

describe('event photos sharing a URL (a resubmission)', () => {
  const photos = [
    { id: 3, event_id: 1, status: 'pending', url: 'https://s.public.blob.vercel-storage.com/events/pending/a.jpg' },
    { id: 1, event_id: 1, status: 'approved', url: 'https://s.public.blob.vercel-storage.com/events/pending/a.jpg' },
    { id: 2, event_id: 9, status: 'approved', url: 'https://s.public.blob.vercel-storage.com/events/pending/b.jpg' },
    { id: 4, event_id: 1, status: 'pending', url: 'https://s.public.blob.vercel-storage.com/events/pending/b.jpg' },
    { id: 5, event_id: 1, status: 'pending', url: '' },
    { id: 6, event_id: 1, status: 'pending', url: '' },
  ]
  it('only a later kept row with the same non-empty URL is a duplicate', () => {
    // #2 is an orphan (event 9 not imported), so #4 owns b.jpg; empty URLs never collide.
    expect(duplicateUrlIds(photos, (r) => r.event_id === 1)).toEqual(new Set([3]))
  })
  it('expectedRows skips the duplicate, so verify and the step agree', () => {
    const keep = expectedRows({ eventIds: new Set([1]), playerIds: new Set(), eventPhotos: photos })['event-photos']
    expect(photos.filter(keep).map((r) => r.id)).toEqual([1, 4, 5, 6])
  })
})
