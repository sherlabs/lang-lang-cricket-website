import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SelectorBallotForm } from '@/components/votes/selector-forms'
import { btnPrimary, btnQuiet } from '@/components/selector/styles'
import { CopyButton } from '@/components/selector/ui'
import { CLUB_TIMEZONE, VOTES, votePaths, selectorPaths } from '@/config/site'
import { getClub } from '@/lib/club'
import { formatMatchDay } from '@/lib/selection/lineup-text'
import { requireSelection } from '@/lib/selector-auth'
import { getLinkInfo } from '@/lib/selector-availability-queries'
import { auditVoters, loadVoteGame } from '@/lib/selector-votes-queries'
import { ConfirmButton } from '@/components/selector/confirm-button'
import { reminderText } from '@/lib/selection/reminder'
import { deleteBallotAction, enterBallotAction, setGameStateAction } from '../../../votes-actions'

export const metadata: Metadata = { title: `${VOTES.label} votes`, robots: { index: false, follow: false } }

type Props = { params: Promise<{ fixtureId: string }> }

const stateForm = 'inline'

export default async function VoteGamePage({ params }: Props) {
  const { fixtureId } = await params
  const id = /^\d{1,9}$/.test(fixtureId) ? Number(fixtureId) : null
  const user = await requireSelection(id ? votePaths.fixture(id) : votePaths.selector)
  if (id == null) notFound()
  const detail = await loadVoteGame(user, id)
  if (!detail) notFound()
  const { locale, siteUrl } = await getClub()
  const { game, settings } = detail
  const link = await getLinkInfo(user)
  const url = link.enabled ? `${siteUrl.replace(/\/$/, '')}${link.path}` : null
  const reminder = reminderText({ gradeName: game.gradeName, opponent: game.opponentName, when: formatMatchDay(game.localDate, locale), names: detail.chase.map((c) => c.name), availabilityUrl: url, kind: 'vote', voteLabel: VOTES.label })
  const audit = await auditVoters(user, id)
  return (
    <main className="container-site max-w-3xl py-6 sm:py-10">
      <p><Link href={votePaths.selector} className="text-sm underline underline-offset-4">All games</Link></p>
      <h1 className="display mt-2 text-3xl text-brand-black">{game.gradeName} v {game.opponentName}</h1>
      <p className="mt-1 text-sm text-brand-grey">{formatMatchDay(game.localDate, locale)}{game.roundName ? `, ${game.roundName}` : ''}</p>
      <p className="mt-3 text-sm text-brand-black">
        {game.status === 'open' ? 'Voting is open.' : game.status === 'closed' ? 'Voting is closed.' : 'Waiting for the result.'}{' '}
        {game.voted} of {game.eligible} players have voted{game.enteredBySelector ? `, plus ${game.enteredBySelector} entered by a selector` : ''}.{' '}
        {game.counts ? 'This game counts.' : `It needs ${game.needed} votes to count.`}{game.countsForAwards ? '' : ' It is excluded from the awards.'}
      </p>

      {detail.isStaff && <section aria-labelledby="state" className="mt-6">
        <h2 id="state" className="text-lg font-bold text-brand-black">Voting for this game</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          {game.status !== 'closed' && <form action={setGameStateAction} className={stateForm}><input type="hidden" name="fixtureId" value={game.id} /><input type="hidden" name="votesState" value="closed" /><button type="submit" className={btnQuiet}>Close voting now</button></form>}
          {game.status !== 'open' && <form action={setGameStateAction} className={stateForm}><input type="hidden" name="fixtureId" value={game.id} /><input type="hidden" name="votesState" value="open" /><button type="submit" className={btnQuiet}>Reopen voting</button></form>}
          {game.votesState !== 'auto' && <form action={setGameStateAction} className={stateForm}><input type="hidden" name="fixtureId" value={game.id} /><input type="hidden" name="votesState" value="auto" /><button type="submit" className={btnQuiet}>Back to automatic</button></form>}
          <form action={setGameStateAction} className={stateForm}><input type="hidden" name="fixtureId" value={game.id} /><input type="hidden" name="countsForAwards" value={game.countsForAwards ? 'false' : 'true'} /><button type="submit" className={btnQuiet}>{game.countsForAwards ? 'Do not count this game (washed out)' : 'Count this game'}</button></form>
        </div>
        <p className="mt-2 text-xs text-brand-grey">Automatic means voting stays open for {settings.voteWindowDays} days after the game.</p>
      </section>}

      <section aria-labelledby="chase" className="mt-8">
        <h2 id="chase" className="text-lg font-bold text-brand-black">Not voted yet ({detail.chase.length})</h2>
        {detail.chase.length === 0 ? <p className="mt-2 text-sm text-brand-grey">Everyone in the team has voted.</p> : (
          <>
            <ul className="mt-2 flex flex-wrap gap-2">
              {detail.chase.map((c) => <li key={c.id}><Link href={selectorPaths.player(c.slug)} className="inline-flex min-h-11 items-center rounded-lg border border-brand-black/20 bg-white px-3 text-sm text-brand-black">{c.name}</Link></li>)}
            </ul>
            {game.status === 'open' && url && <div className="mt-3"><CopyButton text={reminder} label="Copy a reminder text" className={btnPrimary} /></div>}
          </>
        )}
      </section>

      <section aria-labelledby="voted" className="mt-8">
        <h2 id="voted" className="text-lg font-bold text-brand-black">Who has voted</h2>
        <p className="mt-1 text-xs text-brand-grey">This shows who has voted, never who they voted for.</p>
        {detail.voted.length === 0 ? <p className="mt-2 text-sm text-brand-grey">Nobody yet.</p> : (
          <ul className="mt-2 space-y-1 text-sm text-brand-black">
            {detail.voted.map((v, i) => <li key={`${v.name}-${i}`}>{v.name}{v.entered ? ' (entered by a selector)' : ''}</li>)}
          </ul>
        )}
      </section>

      <section aria-labelledby="enter" className="mt-8">
        <h2 id="enter" className="text-lg font-bold text-brand-black">Enter a ballot</h2>
        <p className="mt-1 text-sm text-brand-grey">For a vote you took by phone, or from a coach or umpire. You can enter one ballot per game.</p>
        {detail.form ? (
          <div className="mt-3 rounded-2xl bg-white p-5 ring-1 ring-brand-black/10">
            <SelectorBallotForm action={enterBallotAction} fixtureId={game.id} options={detail.form.options} values={detail.form.values} places={detail.form.places} replaces={detail.myEntryExists} />
          </div>
        ) : <p className="mt-2 text-sm text-brand-grey">{game.status === 'open' ? 'There are no players on record for this game.' : 'Voting is not open for this game. Reopen it above to enter a ballot.'}</p>}
      </section>

      {audit && (
        <section aria-labelledby="audit" className="mt-8 rounded-xl border border-brand-black/15 p-4">
          <h2 id="audit" className="text-lg font-bold text-brand-black">Admin: voters and disputes</h2>
          <p className="mt-1 text-xs text-brand-grey">Only admins see this. It lists who voted and when, never for whom. If a player says someone voted as them, delete their ballot so they can vote again. This looking is logged.</p>
          <ul className="mt-2 space-y-2 text-sm">
            {audit.map((a, i) => (
              <li key={`${a.name}-${i}`} className="flex items-center justify-between gap-3">
                <span>{a.name} ({a.source === 'selector' ? 'entered by a selector' : 'voted'}{a.castAt ? `, ${new Date(a.castAt).toLocaleString(locale, { timeZone: CLUB_TIMEZONE })}` : ''})</span>
              </li>
            ))}
          </ul>
          {audit.some((a) => a.ballotKey) && (
            <form action={deleteBallotAction} className="mt-3 flex flex-wrap items-end gap-3">
              <input type="hidden" name="fixtureId" value={game.id} />
              <label className="text-sm font-medium text-brand-black">Delete the ballot of
                <select name="ballot" required defaultValue="" className="mt-1 block h-12 rounded-lg border border-brand-black/20 bg-white px-3">
                  <option value="">Choose a ballot</option>
                  {audit.map((a) => a.ballotKey ? <option key={a.ballotKey} value={a.ballotKey}>{a.name}{a.source === 'selector' ? ' (entered by a selector)' : ''}</option> : null)}
                </select>
              </label>
              <ConfirmButton label="Delete ballot" confirmLabel="Really delete it?" className={btnQuiet} />
            </form>
          )}
        </section>
      )}
    </main>
  )
}
