import { PageHeader } from '@/components/page-header'
import { TeamCard } from '@/components/teams/team-card'
import { getClub } from '@/lib/club'
import { absoluteUrl, baseOpenGraph, canonicalFor, titleWithSuffix, truncateDescription } from '@/lib/site-metadata'
import { getPublishedWeekend } from '@/lib/teams-queries'

// The data is cached under the `teams` tag (publishing, withdrawing and hiding a player expire it); the page itself renders per request.
export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const [club, weekend] = await Promise.all([getClub(), getPublishedWeekend()])
  const first = weekend?.teams[0]
  const description = weekend
    ? truncateDescription(weekend.teams.map((t) => `${t.gradeName} v ${t.opponentName}: ${t.slots.map((s) => s.name).join(', ')}`).join('. '))
    : `The teams for the next games at ${club.name}.`
  const image = first ? [{ url: absoluteUrl(`/teams/${first.gameId}/lineup-image?v=${Date.parse(first.publishedAt) || 0}`, club.siteUrl), width: 1200, height: 630, alt: `${first.gradeName} team` }] : undefined
  return {
    alternates: canonicalFor('/teams'),
    title: titleWithSuffix(club, 'Teams'),
    description,
    openGraph: { ...baseOpenGraph(club), ...(image ? { images: image } : {}) },
    twitter: { card: 'summary_large_image' as const, ...(image ? { images: image.map((i) => i.url) } : {}) },
  }
}

export default async function TeamsPage() {
  const [club, weekend] = await Promise.all([getClub(), getPublishedWeekend()])
  return (
    <main>
      <PageHeader eyebrow="Teams" title="This week’s teams" intro="The sides picked for the next games. Tap a name for their stats." />
      <section className="container-site py-12 lg:py-16">
        {!weekend ? (
          <p className="text-brand-grey">No teams have been announced yet. Check back later in the week.</p>
        ) : (
          <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2">
            {weekend.teams.map((t) => <TeamCard key={t.gameId} team={t} locale={club.locale} linkTo={`/teams/${t.gameId}`} />)}
          </div>
        )}
      </section>
    </main>
  )
}
