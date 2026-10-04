'use server'

import { getPayloadClient } from '@/lib/payload/client'
import { isTokenShaped } from '@/lib/story-tokens'
import { inStoryTransaction, parseStoryForm, validationMessage } from '@/lib/stories-form'

const INVALID_LINK = { error: 'This edit link is no longer valid.' }

/**
 * Anyone holding the edit token may update the story, in any status (spec §5, §6):
 * - token-keyed write: UUID-shaped token → `limit: 1` lookup → update by `id`, never by `where`;
 * - `data` is the allowlisted form fields only, through the conversion pipeline;
 * - `context.publicSubmission` makes `storyLifecycle` strip status/slug/tokens/timestamps and
 *   set `pending`: an edit to a published story takes it offline until it is re-approved.
 * The collection hook revalidates /history and the story page.
 */
export async function updateDraftByToken(editToken: string, formData: FormData): Promise<{ error: string } | void> {
  if (!isTokenShaped(editToken)) return INVALID_LINK
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'stories',
    where: { editToken: { equals: editToken } },
    limit: 1,
    depth: 0,
  })
  const story = docs[0]
  if (!story) return INVALID_LINK

  const result = await inStoryTransaction(payload, async (req) => {
    const parsed = await parseStoryForm(payload, formData, req)
    if ('error' in parsed) return parsed
    try {
      await payload.update({
        collection: 'stories',
        id: story.id,
        data: parsed.data,
        overrideAccess: true,
        depth: 0,
        context: { publicSubmission: true },
        req,
      })
      return { ok: true as const }
    } catch (err) {
      const message = validationMessage(err)
      if (message) return { error: message }
      throw err
    }
  })
  if ('error' in result) return result
}
