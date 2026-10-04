import 'server-only'
import { headers } from 'next/headers'
import type { NewsView, PageView } from '@/lib/domain'
import { getPayloadClient } from '@/lib/payload/client'
import { toNewsView, toPageView } from '@/lib/payload/mappers'
import type { PreviewCollection } from '@/lib/preview'
import { excerptFromContent } from '@/payload/hooks/storyLifecycle'

/** True when the request carries a signed-in admin or editor session. */
export async function hasStaffSession(): Promise<boolean> {
  try {
    const payload = await getPayloadClient()
    const { user } = await payload.auth({ headers: await headers() })
    return Boolean(user)
  } catch (err) {
    console.warn('[preview] could not check the session:', (err as Error).message)
    return false
  }
}

/**
 * A page or news post in any status, for the staff preview. Only call after `hasStaffSession()` is true:
 * this deliberately has no published filter.
 */
export async function getPreviewDoc(collection: 'pages', id: number): Promise<PageView | null>
export async function getPreviewDoc(collection: 'news', id: number): Promise<NewsView | null>
export async function getPreviewDoc(collection: PreviewCollection, id: number): Promise<PageView | NewsView | null>
export async function getPreviewDoc(collection: PreviewCollection, id: number): Promise<PageView | NewsView | null> {
  const payload = await getPayloadClient()
  try {
    if (collection === 'pages') return toPageView(await payload.findByID({ collection: 'pages', id, depth: 1 }))
    const doc = await payload.findByID({ collection: 'news', id, depth: 1 })
    return toNewsView(doc, doc.excerpt?.trim() || excerptFromContent(doc.body))
  } catch {
    return null
  }
}
