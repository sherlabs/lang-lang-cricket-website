import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/page-header'
import { TeamCard } from '@/components/teams/team-card'
import { getClub } from '@/lib/club'
import { absoluteUrl, baseOpenGraph, canonicalFor, titleWithSuffix, truncateDescription } from '@/lib/site-metadata'
import { getPublishedTeam } from '@/lib/teams-queries'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ gameId: string }> }

/** A draft, a withdrawn team, a removed game and an unknown id all land on this same not-found page. */
export async function generateMetadata({ params }: Props) {
  const { gameId } = await params
  const [club, team] = await Promise.all([getClub(), getPublishedTeam(gameId)])
  if (!team) return { title: titleWithSuffix(club, 'Page not found'), robots: { index: false, follow: false } }
  const image = [{ url: absoluteUrl(`/teams/${team.gameId}/lineup-image`, club.siteUrl), width: 1200, height: 630, alt: `${team.gradeName} team` }]
  return {
    alternates: canonicalFor(`/teams/${team.gameId}`),
    title: titleWithSuffix(club, `${team.gradeName} team v ${team.opponentName}`),
    description: truncateDescription(`${team.gradeName} v ${team.opponentName}: ${team.slots.map((s) => s.name).join(', ')}`),
    openGraph: { ...baseOpenGraph(club), images: image },
    twitter: { card: 'summary_large_image' as const, images: image.map((i) => i.url) },
  }
}

export default async function TeamPage({ params }: Props) {
  const { gameId } = await params
  const team = await getPublishedTeam(gameId)
  if (!team) notFound()
  return (
    <main>
      <PageHeader eyebrow="Teams" title={`${team.gradeName} team`} />
      <section className="container-site py-12 lg:py-16">
        <div className="mx-auto max-w-xl">
          <TeamCard team={team} heading="h2" />
          <p className="mt-6"><Link href="/teams" className="inline-flex min-h-11 items-center font-semibold text-brand-black underline underline-offset-4">All teams this week</Link></p>
        </div>
      </section>
    </main>
  )
}
