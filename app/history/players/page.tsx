import { unstable_noStore as noStore } from 'next/cache'
import { PageHeader } from '@/components/page-header'
import { PlayersSection } from '@/components/players/players-section'
import { listPlayersForHistory } from '@/lib/players/queries'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Players | Lang Lang Cricket Club',
}

export default async function PlayersPage() {
  noStore()
  const { active, past } = await listPlayersForHistory()

  return (
    <main>
      <PageHeader
        eyebrow="Our history"
        title="Players"
        intro="Everyone who has pulled on the colours for our senior teams — current squads and the players who came before them."
      />
      <section className="container-site py-16 lg:py-20">
        {active.length + past.length === 0 ? (
          <p className="text-brand-grey">Player records are on their way.</p>
        ) : (
          <PlayersSection active={active} past={past} />
        )}
      </section>
    </main>
  )
}
