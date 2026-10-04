import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageView } from '@/components/blocks/page-view'
import { JsonLd } from '@/components/json-ld'
import { getClub } from '@/lib/club'
import { getPublishedPage, pageDescription } from '@/lib/pages-queries'
import { baseOpenGraph, canonicalFor, titleWithSuffix, truncateDescription } from '@/lib/site-metadata'
import { webPageJsonLd } from '@/lib/structured-data'
import { getClubWithCrest } from '@/lib/theme'

// Static per page, refreshed on demand when the committee saves (collection hooks) and at the latest every five minutes.
export const revalidate = 300

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const [club, page] = await Promise.all([getClub(), getPublishedPage(slug)])
  if (!page) return { title: 'Page not found' }
  const og = baseOpenGraph(club)
  const description = truncateDescription(pageDescription(page), 160) || club.defaultDescription
  return {
    alternates: canonicalFor(`/info/${page.slug}`),
    title: titleWithSuffix(club, page.seoTitle || page.title),
    description,
    openGraph: { ...og, title: page.seoTitle || page.title, description, images: page.ogImageUrl ? [{ url: page.ogImageUrl, alt: page.title }] : og.images },
  }
}

export default async function InfoPage({ params }: Props) {
  const { slug } = await params
  const [club, page] = await Promise.all([getClubWithCrest(), getPublishedPage(slug)])
  if (!page) notFound()
  return (
    <>
      <JsonLd data={webPageJsonLd({ ...page, description: pageDescription(page) }, club)} />
      <PageView page={page} eyebrow={club.name} />
    </>
  )
}
