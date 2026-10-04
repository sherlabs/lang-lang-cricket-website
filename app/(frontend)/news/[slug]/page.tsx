import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ArticleView } from '@/components/news/article-view'
import { JsonLd } from '@/components/json-ld'
import { getClub } from '@/lib/club'
import { getAdjacentPosts, getPublishedPost } from '@/lib/news-queries'
import { baseOpenGraph, canonicalFor, titleWithSuffix, truncateDescription } from '@/lib/site-metadata'
import { newsArticleJsonLd } from '@/lib/structured-data'
import { getClubWithCrest } from '@/lib/theme'

// Static per post, refreshed on demand when the committee saves and at the latest every five minutes
// (so a post scheduled for later can take up to five minutes to appear).
export const revalidate = 300

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const [club, post] = await Promise.all([getClub(), getPublishedPost(slug)])
  if (!post) return { title: 'News not found' }
  const og = baseOpenGraph(club)
  const description = truncateDescription(post.seoDescription || post.excerpt, 160) || club.defaultDescription
  return {
    alternates: canonicalFor(`/news/${post.slug}`),
    title: titleWithSuffix(club, post.seoTitle || post.title),
    description,
    openGraph: {
      ...og,
      type: 'article',
      title: post.seoTitle || post.title,
      description,
      images: post.coverUrl ? [{ url: post.coverUrl, alt: post.title }] : og.images,
      publishedTime: post.publishedAt.toISOString(),
      modifiedTime: post.updatedAt.toISOString(),
    },
  }
}

export default async function NewsPostPage({ params }: Props) {
  const { slug } = await params
  const [club, post] = await Promise.all([getClubWithCrest(), getPublishedPost(slug)])
  if (!post) notFound()
  const { older, newer } = await getAdjacentPosts(post)
  return (
    <>
      <JsonLd data={newsArticleJsonLd(post, club)} />
      <ArticleView post={post} clubName={club.name} older={older} newer={newer} />
    </>
  )
}
