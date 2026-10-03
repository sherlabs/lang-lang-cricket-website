import { PageHeader } from '@/components/page-header'
import { PlayersDirectory } from '@/components/players/players-directory'
import { listPublicPlayers } from '@/lib/players/queries'
import { canonicalFor, pageSeo } from "@/lib/site-metadata"
import { getClub } from '@/lib/club'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  return { alternates: canonicalFor('/players'), ...pageSeo(await getClub(), 'players') }
}

export default async function PlayersPage() {
  const club = await getClub()
  const { active, past } = await listPublicPlayers(club.teamNamePrefix)
  const copy = club.pageCopy.players

  return (
    <main>
      <PageHeader eyebrow={copy.header.eyebrow} title={copy.header.title} intro={copy.header.intro} />
      <section className="container-site py-16 lg:py-20">
        {active.length + past.length === 0 ? (
          <p className="text-brand-grey">{copy.empty}</p>
        ) : (
          <PlayersDirectory active={active} past={past} />
        )}
      </section>
    </main>
  )
}
