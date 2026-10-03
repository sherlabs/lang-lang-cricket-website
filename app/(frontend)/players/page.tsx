import { PageHeader } from '@/components/page-header'
import { PlayersDirectory } from '@/components/players/players-directory'
import { listPublicPlayers } from '@/lib/players/queries'
import { canonicalFor, pageSeo } from "@/lib/site-metadata"
import { MilestoneStrip } from '@/components/stats/milestone-strip'
import { getClub } from '@/lib/club'
import { milestoneBoard } from '@/lib/stats/milestone-board'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  return { alternates: canonicalFor('/players'), ...pageSeo(await getClub(), 'players') }
}

export default async function PlayersPage() {
  const club = await getClub()
  const { active, past } = await listPublicPlayers(club.teamNamePrefix)
  const copy = club.pageCopy.players
  // The strip is a bonus: if the stats data cannot be read the directory still renders.
  const board = await milestoneBoard().catch((err) => {
    console.warn('[players] milestone strip unavailable:', (err as Error).message)
    return null
  })

  return (
    <main>
      <PageHeader eyebrow={copy.header.eyebrow} title={copy.header.title} intro={copy.header.intro} />
      <section className="container-site py-16 lg:py-20">
        {board && (
          <MilestoneStrip
            heading={copy.milestones.heading}
            note={board.note}
            approaching={board.approaching}
            achieved={board.achievedNow}
            windowLabel={board.windowLabel}
          />
        )}
        {active.length + past.length === 0 ? (
          <p className="text-brand-grey">{copy.empty}</p>
        ) : (
          <PlayersDirectory active={active} past={past} />
        )}
      </section>
    </main>
  )
}
