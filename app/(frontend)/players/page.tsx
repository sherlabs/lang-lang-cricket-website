import { PageHeader } from '@/components/page-header'
import { PlayersDirectory } from '@/components/players/players-directory'
import { listPublicPlayers } from '@/lib/players/queries'
import { canonicalFor, pageSeo } from "@/lib/site-metadata"
import { MilestoneStrip } from '@/components/stats/milestone-strip'
import { getClub } from '@/lib/club'
import { getStatsSettings } from '@/lib/site-settings'
import { filterRows } from '@/lib/stats/leaderboard'
import { buildMilestoneBoard } from '@/lib/stats/milestones'
import { getMilestonePlayers, getVisibleStatData } from '@/lib/stats/queries'
import { coverage, currentSeasonName, shortSeason } from '@/lib/stats/season-window'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  return { alternates: canonicalFor('/players'), ...pageSeo(await getClub(), 'players') }
}

async function milestoneBoard() {
  const [settings, data, players] = await Promise.all([getStatsSettings(), getVisibleStatData(), getMilestonePlayers()])
  const rows = filterRows(data.rows, { cats: settings.defaultIncludedCategories, rules: settings.gradeRules })
  const windowStart = coverage(data.rows)?.from ?? null
  const board = buildMilestoneBoard({
    players, rows, windowStart, currentSeason: currentSeasonName(rows), onlyActive: true,
    config: { thresholds: settings.milestoneThresholds, window: settings.approachWindow },
  })
  const windowLabel = windowStart ? shortSeason(windowStart) : null
  return { ...board, windowLabel, note: windowLabel ? `Counts cover seasons since ${windowLabel} unless an earlier total has been recorded for the player. Updated after each nightly sync.` : '' }
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
            heading={`${copy.milestones.heading}${board.windowLabel ? ` (since ${board.windowLabel} unless a baseline is recorded)` : ''}`}
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
