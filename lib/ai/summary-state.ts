/**
 * The AI flag lifecycle on a yearbook (W2 spec 6.5), pure so the publish gate is unit-tested.
 * - `seasonSummaryAi` is set when an admin accepts a draft with the button and cleared whenever the saved summary is empty,
 *   so discarding a draft never blocks or labels a yearbook.
 * - An AI-flagged summary needs `seasonSummaryChecked` ("I have read and corrected this text") before the yearbook can be
 *   published; changing the summary text resets the tick unless it is ticked (newly) in the same save.
 * - The ticking user is stored for audit (`seasonSummaryCheckedBy`).
 */
export type SummaryFields = { seasonSummary?: string | null; seasonSummaryAi?: boolean | null; seasonSummaryChecked?: boolean | null; seasonSummaryCheckedBy?: number | null; status?: string | null }
export type SummaryResult = { seasonSummaryAi: boolean; seasonSummaryChecked: boolean; seasonSummaryCheckedBy: number | null; error: string | null }

export const PUBLISH_BLOCKED = 'This summary was drafted with AI. Read it, correct it, then tick "I have read and corrected this text" before publishing.'

export function nextSummaryState(data: SummaryFields, original: SummaryFields | undefined, userId: number | null): SummaryResult {
  const pick = <K extends keyof SummaryFields>(k: K): SummaryFields[K] => (k in data ? data[k] : original?.[k])
  const text = (pick('seasonSummary') ?? '').toString().trim()
  if (!text) return { seasonSummaryAi: false, seasonSummaryChecked: false, seasonSummaryCheckedBy: null, error: null }
  const ai = Boolean(pick('seasonSummaryAi'))
  const changed = (original?.seasonSummary ?? '').toString().trim() !== text
  const prevChecked = Boolean(original?.seasonSummaryChecked)
  // The admin form sends every field, so a tick that was already there proves nothing: only a new tick in this save counts.
  const tickedNow = data.seasonSummaryChecked === true && !prevChecked
  let checked = 'seasonSummaryChecked' in data ? Boolean(data.seasonSummaryChecked) : prevChecked
  // New text (or a new draft) needs reading again, unless the person ticks it in this very save.
  if (ai && changed && !tickedNow) checked = false
  const by = !checked ? null : !prevChecked || changed ? userId : (original?.seasonSummaryCheckedBy ?? userId)
  const publishing = pick('status') === 'published'
  return { seasonSummaryAi: ai, seasonSummaryChecked: checked, seasonSummaryCheckedBy: by, error: publishing && ai && !checked ? PUBLISH_BLOCKED : null }
}
