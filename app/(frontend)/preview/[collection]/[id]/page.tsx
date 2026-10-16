import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageView } from '@/components/blocks/page-view'
import { ArticleView } from '@/components/news/article-view'
import { getClubWithCrest } from '@/lib/theme'
import { parsePreviewParams } from '@/lib/preview'
import { getPreviewDoc, hasStaffSession } from '@/lib/preview-queries'

// Staff only and never cached or indexed: the public routes stay statically cacheable.
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Preview', robots: { index: false, follow: false } }

type Props = { params: Promise<{ collection: string; id: string }> }

export default async function PreviewPage({ params }: Props) {
  const raw = await params
  const parsed = parsePreviewParams(raw.collection, raw.id)
  if (!parsed) notFound()
  if (!(await hasStaffSession())) notFound()
  const club = await getClubWithCrest()
  if (parsed.collection === 'pages') {
    const page = await getPreviewDoc('pages', parsed.id)
    if (!page) notFound()
    return (
      <>
        <PreviewBanner status={page.status} />
        <PageView page={page} eyebrow={club.name} />
      </>
    )
  }
  const post = await getPreviewDoc('news', parsed.id)
  if (!post) notFound()
  return (
    <>
      <PreviewBanner status="preview" />
      <ArticleView post={post} clubName={club.name} />
    </>
  )
}

function PreviewBanner({ status }: { status: string }) {
  return (
    <p role="status" className="bg-brand-gold px-4 py-2 text-center text-sm font-semibold text-brand-black">
      Preview for the committee only{status === 'draft' ? ' (this is still a draft)' : ''}. Visitors cannot see this page.
    </p>
  )
}
