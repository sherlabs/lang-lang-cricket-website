import 'server-only'
import type { Story } from '@/lib/domain'
import type { Story as StoryDoc } from '@/payload-types'
import { getPayloadClient } from '@/lib/payload/client'
import { toStory } from '@/lib/payload/mappers'
import { lexicalToTiptapHtml, type StoryContent } from '@/lib/stories-convert'
import { isTokenShaped } from '@/lib/story-tokens'

/**
 * Public story reads (spec §14). The Local API runs with overrideAccess, so every query states
 * its own filter: `status = published`, or a token lookup (which a token page needs in any
 * status). `depth: 1` populates the cover and the body's upload nodes. Results go through
 * `toStory`, so no token or email leaves this module (except `getStoryForEdit`'s own email).
 */

export async function listPublishedStories(): Promise<Story[]> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'stories',
    where: { status: { equals: 'published' } },
    sort: '-publishedAt',
    pagination: false,
    depth: 1,
    // Card fields only: no body (and so none of its media docs) for the list page.
    select: {
      slug: true,
      title: true,
      excerpt: true,
      coverImage: true,
      authorName: true,
      status: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  })
  // `content` and the moderation fields are absent; toStory maps them to null/false.
  return docs.map((d) => toStory(d as StoryDoc))
}

export async function getPublishedStoryBySlug(slug: string): Promise<Story | null> {
  if (typeof slug !== 'string' || !slug) return null
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'stories',
    where: { and: [{ slug: { equals: slug } }, { status: { equals: 'published' } }] },
    limit: 1,
    depth: 1,
  })
  return docs[0] ? toStory(docs[0]) : null
}

async function findByToken(field: 'editToken' | 'viewToken', token: string) {
  if (!isTokenShaped(token)) return null
  const payload = await getPayloadClient()
  const { docs } = await payload.find({ collection: 'stories', where: { [field]: { equals: token } }, limit: 1, depth: 1 })
  return docs[0] ?? null
}

/** Read-only preview via secret link — any status. */
export async function getStoryByViewToken(viewToken: string): Promise<Story | null> {
  const doc = await findByToken('viewToken', viewToken)
  return doc ? toStory(doc) : null
}

/**
 * What the token edit page needs: the story, the submitter's own email (they hold the edit
 * link) and the body as HTML for Tiptap (spec §5 step 5).
 */
export async function getStoryForEdit(editToken: string): Promise<{ story: Story; authorEmail: string; contentHtml: string } | null> {
  const doc = await findByToken('editToken', editToken)
  if (!doc) return null
  return {
    story: toStory(doc),
    authorEmail: doc.authorEmail ?? '',
    contentHtml: lexicalToTiptapHtml(doc.content as unknown as StoryContent),
  }
}
