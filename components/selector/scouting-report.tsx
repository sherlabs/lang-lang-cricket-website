import Link from 'next/link'
import { formatMatchDayYear } from '@/lib/selection/lineup-text'
import { ledgerText, NOT_RECORDED, one, outcomeWord, resultWord, scoreText, whole } from '@/lib/scouting/format'
import type { TotalsStat } from '@/lib/scouting/totals'
import type { ScoutingReport } from '@/lib/selector-scouting-queries'

const card = 'rounded-xl bg-white p-4 ring-1 ring-brand-black/10'
const th = 'px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-brand-grey'
const td = 'px-2 py-1.5 align-top'
/** Only PlayHQ games have a public scorecard page; imported history ids are not UUIDs. */
const SCORECARD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NOTICE = 'Third-party names, for selection use only.'

function Table({ caption, head, children }: { caption: string; head: string[]; children: React.ReactNode }) {
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full min-w-[20rem] text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead><tr>{head.map((h) => <th key={h} scope="col" className={th}>{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-brand-black/10">{children}</tbody>
      </table>
    </div>
  )
}

function Section({ title, summary, open, children }: { title: string; summary: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className={`${card} scout-section mt-4`}>
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
        <span className="flex flex-col">
          <h2 className="text-lg font-bold text-brand-black">{title}</h2>
          <span className="text-sm text-brand-grey">{summary}</span>
        </span>
        <svg aria-hidden="true" viewBox="0 0 20 20" className="scout-chevron size-5 shrink-0 text-brand-grey transition-transform"><path d="m5 8 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  )
}

const Notice = () => <p className="mt-1 text-sm font-semibold text-brand-black">{NOTICE} Matched by name only, so figures are approximate.</p>

function totalsRow(label: string, s: TotalsStat) {
  return (
    <tr key={label}>
      <th scope="row" className={`${td} font-semibold`}>{label}</th>
      <td className={td}>{s.n}</td>
      <td className={td}>{whole(s.mean)}</td>
      <td className={td}>{whole(s.high)}</td>
      <td className={td}>{whole(s.low)}</td>
      <td className={td}>{s.n ? `${s.allOut} of ${s.n}` : NOT_RECORDED}</td>
      <td className={td}>{s.wicketsN ? `${one(s.meanWickets)} (n=${s.wicketsN})` : NOT_RECORDED}</td>
    </tr>
  )
}



/** The scouting report page body. Order for a phone: status, plan, danger players, then collapsed sections. Print opens them all. */
export function ScoutingReportView({ report, locale }: { report: ScoutingReport; locale: string }) {
  const r = report
  const day = (d: string | null) => (d ? formatMatchDayYear(d, locale) : 'Date not recorded')
  const last = r.h2h.last
  const status = r.enough
    ? `${r.total} ${r.total === 1 ? 'game' : 'games'} stored against ${r.label}${r.capped ? `; this report uses the newest ${r.used}` : ''}.`
    : `Only ${r.total} ${r.total === 1 ? 'game' : 'games'} stored against ${r.label}. That is not enough for a plan yet (it needs ${r.minSample}); here are the results so far.`

  const ledger = (
    <Section title="Games so far" summary={`${r.games.length} ${r.games.length === 1 ? 'game' : 'games'}, newest first`} open={!r.enough}>
      <Table caption="Every stored game against this club" head={['Date', 'Grade', 'Result', 'Us', 'Them', 'Venue']}>
        {r.games.map((g) => (
          <tr key={g.gameId}>
            <td className={td}>{day(g.date)}</td>
            <td className={td}>{g.grade ?? NOT_RECORDED}</td>
            <td className={`${td} font-semibold`}>{resultWord(g.result, g.forfeit)}</td>
            <td className={td}>{scoreText(g.ours)}</td>
            <td className={td}>{scoreText(g.theirs)}</td>
            <td className={td}>{[g.isHome ? 'Home' : 'Away', g.venue].filter(Boolean).join(', ')}</td>
          </tr>
        ))}
      </Table>
      {r.imported > 0 && <p className="mt-2 text-sm text-brand-grey">{r.imported} of these {r.imported === 1 ? 'is an imported history game' : 'are imported history games'}: they have a result, and scores only where the old record had them. They have no opposition players.</p>}
    </Section>
  )

  return (
    <div className="scout-print">
      <p className="rounded-xl bg-brand-gold-pale p-4 text-base font-semibold text-brand-black ring-1 ring-brand-gold/30">{status}</p>

      {!r.enough && ledger}

      <section aria-labelledby="plan" className={`${card} scout-section mt-4`}>
        <h2 id="plan" className="text-lg font-bold text-brand-black">Game plan</h2>
        {r.plan.length ? (
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-brand-charcoal">{r.plan.map((p) => <li key={p.id}>{p.text}</li>)}</ul>
        ) : (
          <p className="mt-2 text-brand-grey">{r.enough ? 'No rule has enough recorded games behind it to say anything yet.' : `Plan sentences appear once ${r.minSample} games (or tosses and innings) back them.`}</p>
        )}
        <p className="mt-2 text-xs text-brand-grey">Each line comes from a fixed rule and shows the number of games it rests on. Nothing is predicted.</p>
      </section>

      <section aria-labelledby="danger" className={`${card} scout-section mt-4`}>
        <h2 id="danger" className="text-lg font-bold text-brand-black">Danger batters and bowlers</h2>
        <Notice />
        {r.danger.mode === 'named' ? (
          <>
            {r.danger.batters.length ? (
              <>
                <h3 className="mt-3 text-base font-bold text-brand-black">Batters</h3>
                <Table caption={`Their top batters against us, listed from ${r.minInnings} innings`} head={['Batter', 'Inns', 'Outs', 'Runs', 'Average', 'High', '50s', 'Last innings']}>
                  {r.danger.batters.map((b) => (
                    <tr key={b.key}>
                      <th scope="row" className={`${td} font-semibold`}>{b.name}{b.possiblyMerged && <span className="block text-xs font-normal text-brand-grey">Two players of this name in one game, so this may be two people.</span>}</th>
                      <td className={td}>{b.innings}</td>
                      <td className={td}>{b.outs}</td>
                      <td className={td}>{b.runs}</td>
                      <td className={td}>{b.average === null ? `not out ${b.runs} runs` : one(b.average)}</td>
                      <td className={td}>{b.highScore}{b.highScoreNotOut ? '*' : ''}</td>
                      <td className={td}>{b.fifties}</td>
                      <td className={td}>{b.recent.join(', ')}</td>
                    </tr>
                  ))}
                </Table>
              </>
            ) : <p className="mt-3 text-brand-grey">{`No opposition batter has ${r.minInnings} or more recorded innings against us yet.`}</p>}
            {r.danger.bowlers.length ? (
              <>
                <h3 className="mt-4 text-base font-bold text-brand-black">Bowlers</h3>
                <Table caption={`Their top bowlers against us, listed from ${r.minBalls} balls`} head={['Bowler', 'Spells', 'Balls', 'Wkts', 'Runs', 'Economy', 'Last spells']}>
                  {r.danger.bowlers.map((b) => (
                    <tr key={b.key}>
                      <th scope="row" className={`${td} font-semibold`}>{b.name}{b.possiblyMerged && <span className="block text-xs font-normal text-brand-grey">Two players of this name in one game, so this may be two people.</span>}</th>
                      <td className={td}>{b.spells}</td>
                      <td className={td}>{b.balls}</td>
                      <td className={td}>{b.wickets}</td>
                      <td className={td}>{b.runs}</td>
                      <td className={td}>{one(b.economy)}</td>
                      <td className={td}>{b.recent.join(', ')}</td>
                    </tr>
                  ))}
                </Table>
              </>
            ) : <p className="mt-3 text-brand-grey">{`No opposition bowler has bowled ${r.minBalls} or more recorded balls against us yet.`}</p>}
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-brand-grey">Names are switched off by the club, so these are by batting position and bowling order.</p>
            {r.danger.batting.length ? (
              <Table caption="Their batting by position" head={['Position', 'Inns', 'Runs', 'Average', 'High']}>
                {r.danger.batting.map((b) => (
                  <tr key={b.position}><th scope="row" className={`${td} font-semibold`}>Batting at {b.position}</th><td className={td}>{b.innings}</td><td className={td}>{b.runs}</td><td className={td}>{b.average === null ? 'no dismissals' : one(b.average)}</td><td className={td}>{b.highScore}</td></tr>
                ))}
              </Table>
            ) : <p className="mt-3 text-brand-grey">Not enough recorded innings by batting position yet.</p>}
            {r.danger.bowling.length ? (
              <Table caption="Their bowling by order" head={['Bowler', 'Spells', 'Balls', 'Wkts', 'Runs', 'Economy']}>
                {r.danger.bowling.map((b) => (
                  <tr key={b.order}><th scope="row" className={`${td} font-semibold`}>Bowler number {b.order}</th><td className={td}>{b.spells}</td><td className={td}>{b.balls}</td><td className={td}>{b.wickets}</td><td className={td}>{b.runs}</td><td className={td}>{one(b.economy)}</td></tr>
                ))}
              </Table>
            ) : <p className="mt-3 text-brand-grey">Not enough recorded bowling by order yet.</p>}
          </>
        )}
      </section>

      <Section title="Head to head" summary={ledgerText(r.h2h.total)}>
        <p className="text-sm text-brand-charcoal">Home: {ledgerText(r.h2h.home)}. Away: {ledgerText(r.h2h.away)}.</p>
        {last && <p className="mt-2 text-sm text-brand-charcoal">Last meeting: {SCORECARD_ID.test(last.gameId) ? <Link href={`/fixtures/${last.gameId}`} className="font-semibold underline underline-offset-4">{day(last.date)}</Link> : day(last.date)}{last.grade ? `, ${last.grade}` : ''}. {resultWord(last.result, last.forfeit)}. Us {scoreText(last.ours)}, them {scoreText(last.theirs)}.</p>}
        <Table caption="Results by season" head={['Season', 'Record']}>
          {r.h2h.bySeason.map((s) => <tr key={s.season}><th scope="row" className={`${td} font-semibold`}>{s.season}</th><td className={td}>{ledgerText(s.ledger)}</td></tr>)}
        </Table>
      </Section>

      <Section title="Their results against us" summary={r.h2h.theirRecent.length ? r.h2h.theirRecent.map((t) => t.outcome).join(' ') : 'No games'}>
        <ol className="flex flex-wrap gap-2" aria-label="Their last results against us, newest first">
          {r.h2h.theirRecent.map((t) => (
            <li key={t.gameId} className="inline-flex min-h-11 min-w-11 flex-col items-center justify-center rounded-lg bg-brand-black/5 px-2 text-center">
              <span className="font-bold text-brand-black">{t.outcome}</span>
              <span className="text-xs text-brand-grey">{outcomeWord(t.outcome)}{t.forfeit ? ' (forfeit)' : ''}</span>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-brand-grey">Only games against our club are stored, so this is their recent record against us, not their form.</p>
      </Section>

      <Section title="Typical totals" summary={r.totals.theirs.all.n ? `Their average against us ${whole(r.totals.theirs.all.mean)} (n=${r.totals.theirs.all.n})` : 'No totals recorded'}>
        {(['theirs', 'ours'] as const).map((side) => (
          <div key={side} className="mt-2 first:mt-0">
            <h3 className="text-base font-bold text-brand-black">{side === 'theirs' ? 'Their innings against us' : 'Our innings against them'}</h3>
            <Table caption={side === 'theirs' ? 'Their totals against us' : 'Our totals against them'} head={['', 'Inns', 'Mean', 'High', 'Low', 'All out', 'Wkts lost']}>
              {totalsRow('All', r.totals[side].all)}
              {totalsRow('Batting first', r.totals[side].first)}
              {totalsRow('Chasing', r.totals[side].chasing)}
            </Table>
            {r.totals[side].excluded > 0 && <p className="mt-1 text-xs text-brand-grey">{r.totals[side].excluded} {r.totals[side].excluded === 1 ? 'innings has' : 'innings have'} no recorded total and {r.totals[side].excluded === 1 ? 'is' : 'are'} left out.</p>}
          </div>
        ))}
      </Section>

      <Section title="Toss" summary={r.toss.known ? `They won ${r.toss.theyWon} of ${r.toss.known} recorded tosses` : 'No toss recorded'}>
        {r.toss.known === 0 ? <p className="text-brand-grey">No toss is recorded for these games.</p> : (
          <ul className="space-y-1 text-sm text-brand-charcoal">
            <li>They won the toss in {r.toss.theyWon} of {r.toss.known} games with a recorded toss (n={r.toss.known}).</li>
            <li>When they won it they chose to bat {r.toss.chose.bat} times and to bowl {r.toss.chose.bowl} times{r.toss.choiceUnknown ? `; the choice is not recorded for ${r.toss.choiceUnknown}` : ''}.</li>
            <li>Our results in those games: won {r.toss.ourResultAfter.won}, lost {r.toss.ourResultAfter.lost}, other {r.toss.ourResultAfter.other}.</li>
          </ul>
        )}
      </Section>

      <Section title="Our best against them" summary={r.best.batters.length || r.best.bowlers.length ? 'Our players’ figures in these games' : 'No player figures'}>
        {r.best.batters.length ? (
          <Table caption="Our top batters against them" head={['Batter', 'Inns', 'Runs', 'Average', 'High']}>
            {r.best.batters.map((b) => <tr key={b.id}><th scope="row" className={`${td} font-semibold`}>{b.name}</th><td className={td}>{b.row.battingInnings}</td><td className={td}>{b.row.runs}</td><td className={td}>{b.row.average === null ? `not enough (${b.row.battingInnings} inns)` : one(b.row.average)}</td><td className={td}>{b.row.highScore}{b.row.highScoreNotOut ? '*' : ''}</td></tr>)}
          </Table>
        ) : <p className="text-brand-grey">No batting figures stored for our players in these games.</p>}
        {r.best.bowlers.length ? (
          <Table caption="Our top bowlers against them" head={['Bowler', 'Spells', 'Wkts', 'Runs', 'Economy']}>
            {r.best.bowlers.map((b) => <tr key={b.id}><th scope="row" className={`${td} font-semibold`}>{b.name}</th><td className={td}>{b.row.bowlingInnings}</td><td className={td}>{b.row.wickets}</td><td className={td}>{b.row.runsConceded}</td><td className={td}>{b.row.economy === null ? `not enough (${b.row.bowlBalls} balls)` : one(b.row.economy)}</td></tr>)}
          </Table>
        ) : null}
        <p className="mt-2 text-xs text-brand-grey">Same figures as the public Opposition page. Players the club has hidden are not included.</p>
      </Section>

      <Section title="Venue history" summary={r.h2h.venues.length ? `${r.h2h.venues.length} ${r.h2h.venues.length === 1 ? 'venue' : 'venues'}` : 'No venue recorded'}>
        {r.h2h.venues.length ? (
          <Table caption="Results by venue" head={['Venue', 'Record']}>
            {r.h2h.venues.map((v) => <tr key={v.venue}><th scope="row" className={`${td} font-semibold`}>{v.venue}</th><td className={td}>{ledgerText(v.ledger)}</td></tr>)}
          </Table>
        ) : <p className="text-brand-grey">No venue is recorded for these games.</p>}
      </Section>

      {r.enough && ledger}
    </div>
  )
}
