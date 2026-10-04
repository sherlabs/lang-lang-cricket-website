import { describe, expect, it } from 'vitest'
import { PUBLISH_BLOCKED, nextSummaryState } from '@/lib/ai/summary-state'

describe('AI summary lifecycle', () => {
  it('an empty summary clears the flag and the tick, so a discarded draft never blocks or labels', () => {
    const r = nextSummaryState({ seasonSummary: '', status: 'published' }, { seasonSummary: 'Draft.', seasonSummaryAi: true, seasonSummaryChecked: true, seasonSummaryCheckedBy: 4 }, 9)
    expect(r).toEqual({ seasonSummaryAi: false, seasonSummaryChecked: false, seasonSummaryCheckedBy: null, error: null })
  })

  it('refuses to publish an AI summary nobody ticked', () => {
    const r = nextSummaryState({ seasonSummary: 'Draft.', seasonSummaryAi: true, status: 'published' }, undefined, 9)
    expect(r.error).toBe(PUBLISH_BLOCKED)
    expect(r.seasonSummaryChecked).toBe(false)
  })

  it('allows a draft status with an unticked AI summary', () => {
    expect(nextSummaryState({ seasonSummary: 'Draft.', seasonSummaryAi: true, status: 'draft' }, undefined, 9).error).toBeNull()
  })

  it('publishing is allowed once ticked, and the ticking user is recorded', () => {
    const r = nextSummaryState({ seasonSummary: 'Draft.', seasonSummaryAi: true, seasonSummaryChecked: true, status: 'published' }, { seasonSummary: 'Draft.', seasonSummaryAi: true, seasonSummaryChecked: false }, 7)
    expect(r).toEqual({ seasonSummaryAi: true, seasonSummaryChecked: true, seasonSummaryCheckedBy: 7, error: null })
  })

  it('keeps the original ticker when a later save does not change the tick', () => {
    const r = nextSummaryState({ premiership: 'x' } as never, { seasonSummary: 'Text.', seasonSummaryAi: true, seasonSummaryChecked: true, seasonSummaryCheckedBy: 7, status: 'published' }, 9)
    expect(r).toMatchObject({ seasonSummaryChecked: true, seasonSummaryCheckedBy: 7, error: null })
  })

  it('editing the text resets the tick, unless ticked in the same save; a new draft resets it', () => {
    const original = { seasonSummary: 'Old text.', seasonSummaryAi: true, seasonSummaryChecked: true, seasonSummaryCheckedBy: 7, status: 'published' }
    expect(nextSummaryState({ seasonSummary: 'Edited text.' }, original, 9)).toMatchObject({ seasonSummaryChecked: false, error: PUBLISH_BLOCKED })
    // The admin form always sends the old tick back with the new text: that does not count as having read the new text.
    expect(nextSummaryState({ seasonSummary: 'Edited text.', seasonSummaryChecked: true }, original, 9)).toMatchObject({ seasonSummaryChecked: false, error: PUBLISH_BLOCKED })
    const unticked = { ...original, seasonSummaryChecked: false, seasonSummaryCheckedBy: null }
    expect(nextSummaryState({ seasonSummary: 'Edited text.', seasonSummaryChecked: true }, unticked, 9)).toMatchObject({ seasonSummaryChecked: true, seasonSummaryCheckedBy: 9, error: null })
    expect(nextSummaryState({ seasonSummary: 'New draft.', seasonSummaryAi: true, seasonSummaryChecked: false }, original, 9).seasonSummaryChecked).toBe(false)
  })

  it('a hand-written summary (no AI flag) publishes freely', () => {
    expect(nextSummaryState({ seasonSummary: 'We had a great year.', status: 'published' }, undefined, 9)).toMatchObject({ seasonSummaryAi: false, error: null })
  })
})
