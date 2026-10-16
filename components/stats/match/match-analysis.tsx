import Link from 'next/link'
import { DismissalChart } from '@/components/stats/match/dismissal-chart'
import { OppositionTable, type OppositionRowView } from '@/components/stats/match/opposition-table'
import { PartnershipList } from '@/components/stats/match/partnership-list'
import { PositionTable } from '@/components/stats/match/position-table'
import type { OppositionPlayerRow } from '@/lib/stats/match/opposition'
import type { ProfileMatchView } from '@/lib/stats/match/profile'
import type { MatchMinimums } from '@/lib/stats/match/minimums'
import { ballsToOvers } from '@/lib/playhq/players'

const f = (v: number | null, dp: number) => (v === null ? 'n/a' : v.toFixed(dp))

export function oppositionRowView(r: OppositionPlayerRow): OppositionRowView {
  return {
    key: r.key, label: r.label, games: r.games, innings: r.battingInnings, runs: r.runs,
    average: r.battingInnings === 0 ? '–' : f(r.average, 2),
    highScore: r.battingInnings === 0 ? '–' : `${r.highScore}${r.highScoreNotOut ? '*' : ''}`,
    fifties: r.fifties, hundreds: r.hundreds, ducks: r.ducks, wickets: r.wickets,
    best: r.bowlBalls === 0 ? '–' : `${r.bestWickets}/${r.bestRuns}`,
    economy: r.bowlBalls === 0 ? '–' : f(r.economy, 2),
    catches: r.catches,
  }
}

const SECTIONS = [
  { id: 'against-opposition', label: 'Against each opposition' },
  { id: 'how-out', label: 'How out' },
  { id: 'how-wickets-came', label: 'How wickets came' },
  { id: 'partnerships', label: 'Partnerships' },
  { id: 'batting-position', label: 'Batting position' },
] as const

const note = 'mt-2 text-sm text-brand-grey'
const h3 = 'display text-xl text-brand-black'

/**
 * "Match analysis" block of a player profile: derived from the stored matches, labelled "from match
 * data", each section with its coverage caption. No client tabs and no search params (the route stays
 * as it was); the sub-nav is plain anchors. Sections with no rows are left out.
 */
export function MatchAnalysis({ view, minimums }: { view: ProfileMatchView; minimums: MatchMinimums }) {
  const present = new Set<string>()
  if (view.opposition.length > 0) present.add('against-opposition')
  if (view.dismissals) present.add('how-out')
  if (view.wickets) present.add('how-wickets-came')
  if (view.partnerships) present.add('partnerships')
  if (view.position) present.add('batting-position')
  const nav = SECTIONS.filter((s) => present.has(s.id))
  if (nav.length === 0) return null
  const oppRows = view.opposition.map(oppositionRowView)
  return (
    <section aria-labelledby="match-analysis-heading" className="space-y-10">
      <div>
        <h2 id="match-analysis-heading" className="display text-2xl text-brand-black">Match analysis</h2>
        <p className={note}>From match data. {view.base} Figures count recorded innings only, and a rate shows n/a until there is enough to support it.</p>
        {view.milestones.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {view.milestones.map((m) => (
              <li key={m.key} className="inline-flex items-center rounded-full bg-brand-gold-pale px-3 py-1.5 text-sm font-semibold text-brand-gold-deep ring-1 ring-brand-gold/30">{m.label}, since the first stored match</li>
            ))}
          </ul>
        )}
        <nav aria-label="Match analysis sections" className="-mx-5 mt-4 overflow-x-auto px-5 sm:mx-0 sm:px-0">
          <ul className="flex w-max gap-2">
            {nav.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="inline-flex min-h-11 items-center rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-brand-charcoal ring-1 ring-brand-black/10 transition hover:ring-brand-gold/60">{s.label}</a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {present.has('against-opposition') && (
        <div id="against-opposition" className="scroll-mt-24">
          <h3 className={h3}>Against each opposition</h3>
          <p className={note}>{view.base} Averages need {minimums.oppositionInnings} innings and economy needs {minimums.oppositionBalls / 6} overs against that club; below that the counts show and the rate is n/a. Bowling columns use innings with bowling figures only.</p>
          <div className="mt-4 overflow-x-auto"><div className="min-w-[44rem]"><OppositionTable rows={oppRows} caption="Batting, bowling and catches against each opposition, from match data" /></div></div>
        </div>
      )}

      {view.dismissals && (
        <div id="how-out" className="scroll-mt-24">
          <h3 className={h3}>How out</h3>
          <p className={note}>{view.dismissals.caption} Caught includes caught and bowled in the shares.</p>
          <div className="mt-4">
            <DismissalChart title="Dismissals" segments={view.dismissals.batter.segments} idPrefix="how-out-chart" />
          </div>
          <p className={note}>
            {view.dismissals.batter.retiredNotOut > 0 ? `${view.dismissals.batter.retiredNotOut} retirement${view.dismissals.batter.retiredNotOut === 1 ? '' : 's'} counted as not out. ` : ''}
            {view.dismissals.batter.bowledPct === null ? `Shares need ${minimums.rateInnings} dismissals with a recorded type.` : `Bowled ${f(view.dismissals.batter.bowledPct, 0)}%, caught ${f(view.dismissals.batter.caughtPct, 0)}%, LBW ${f(view.dismissals.batter.lbwPct, 0)}% of recorded dismissals.`}
            {view.dismissals.batter.runOutLowConfidence ? ' Based on a small number of recorded run outs and stumpings.' : ''}
          </p>
        </div>
      )}

      {view.wickets && (
        <div id="how-wickets-came" className="scroll-mt-24">
          <h3 className={h3}>How wickets came</h3>
          <p className={note}>{view.wickets.caption} Run outs and retirements are never credited to a bowler.</p>
          <div className="mt-4">
            <DismissalChart title="Wickets by type" segments={view.wickets.bowler.segments} idPrefix="how-wickets-chart" unit="wickets" />
          </div>
          <p className={note}>
            {view.counts.bowlingInnings} innings with bowling figures, {ballsToOvers(view.counts.bowlBalls)} overs.
            {view.counts.fiveFors > 0 ? ` ${view.counts.fiveFors} five-wicket ${view.counts.fiveFors === 1 ? 'haul' : 'hauls'} (recorded).` : ''}
          </p>
        </div>
      )}

      {view.partnerships && (
        <div id="partnerships" className="scroll-mt-24">
          <h3 className={h3}>Partnerships</h3>
          <p className={note}>{view.base} Inferred from batting order and fall of wickets.</p>
          <div className="mt-4"><PartnershipList data={view.partnerships} /></div>
          <p className={note}><Link href="/records/partnerships" className="font-semibold text-brand-gold-deep underline underline-offset-2">Club partnership records</Link></p>
        </div>
      )}

      {view.position && (
        <div id="batting-position" className="scroll-mt-24">
          <h3 className={h3}>Batting position</h3>
          <p className={note}>{view.position.caption}</p>
          <div className="mt-4"><PositionTable summary={view.position.summary} minInnings={minimums.positionInnings} /></div>
        </div>
      )}
    </section>
  )
}
