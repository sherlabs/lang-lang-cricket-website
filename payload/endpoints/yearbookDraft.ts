import type { Endpoint } from 'payload'
import { claimDraft, releaseDraft } from '../../lib/ai/draft-counter'
import { aiConfigured, dailyLimit, draftSeasonSummary } from '../../lib/ai/yearbook-draft'
import { fail, refuseNonAdmin } from './adminOnly'

/**
 * `POST /api/yearbooks/:id/draft-summary` (admin only; W2 spec 6.5, issue #12). Returns draft text and saves nothing: the admin
 * form puts it in the summary field, the editor reads and corrects it, and a hook refuses to publish it until it is ticked as read.
 * 503 when no AI key is set (no network call is made); 429 past the site-wide daily limit; the model call is bounded in
 * output size and time.
 */
export const yearbookDraftEndpoint: Endpoint = {
  path: '/:id/draft-summary',
  method: 'post',
  handler: async (req) => {
    const refused = refuseNonAdmin(req)
    if (refused) return refused
    if (!aiConfigured()) return fail(503, 'AI drafting is not set up on this site.')
    const id = Number(req.routeParams?.id)
    if (!Number.isInteger(id) || id < 1) return fail(404, 'Yearbook not found.')
    const book = await req.payload.findByID({ collection: 'yearbooks', id, depth: 0, overrideAccess: true }).catch(() => null)
    if (!book) return fail(404, 'Yearbook not found.')

    if (!(await claimDraft(req.payload, dailyLimit()))) return fail(429, 'The limit of AI drafts for today has been reached. Try again tomorrow, or write the summary yourself.')
    // Loaded on demand: the facts module reads the public stats queries, which are server-only and must stay out of the config import graph.
    const { gatherYearbookFacts } = await import('../../lib/ai/yearbook-facts')
    let res: Awaited<ReturnType<typeof draftSeasonSummary>>
    try {
      const facts = await gatherYearbookFacts({ seasonName: book.seasonName, premiership: book.premiership ?? null })
      res = await draftSeasonSummary(facts)
    } catch (err) {
      // Anything that throws before a draft exists does not use up one of the day's drafts either.
      await releaseDraft(req.payload)
      throw err
    }
    if (!res.ok) {
      // A call that failed fast (502) does not use up one of the day's drafts. A timeout (504) is not refunded: the model may
      // still have run and been billed, so repeated timeouts must count against the daily limit.
      if (res.status !== 504) await releaseDraft(req.payload)
      return fail(res.status, res.message)
    }
    return Response.json({ text: res.text, aiAssisted: true })
  },
}
