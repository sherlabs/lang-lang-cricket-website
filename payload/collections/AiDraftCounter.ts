import { internalCollection, num, text } from './internalCollection'

/** The site-wide daily count of AI yearbook drafts (W2 spec 6.5). One row per day; written only by `lib/ai/draft-counter.ts`. */
export const AiDraftCounter = internalCollection({
  slug: 'ai-draft-counter',
  singular: 'AI draft counter',
  plural: 'AI draft counter (data)',
  description: 'How many AI yearbook drafts were asked for each day. Written by the site; read only.',
  defaultColumns: ['day', 'count'],
  fields: [text('day', { required: true, unique: true, index: true }), num('count', { required: true, defaultValue: 0 })],
})
