import { aiConfigured } from '@/lib/ai/yearbook-draft'
import { YearbookDraftControls } from './YearbookDraftControls'

/** `yearbooks.seasonSummaryDraft` (admin only): decides on the server whether AI drafting is set up, then renders the controls. */
export function YearbookDraftButton() {
  return <YearbookDraftControls configured={aiConfigured()} />
}
