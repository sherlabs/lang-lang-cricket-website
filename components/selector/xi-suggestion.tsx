import Link from 'next/link'
import { ROLE_LABEL } from '@/lib/selection/roles'
import { SELECTION } from '@/config/site'
import type { SuggestionView } from '@/lib/selector-xi-queries'
import { keeper as keeperState, left, pinned, suggestHref, type XiState } from '@/lib/selection/xi-links'
import { UseXiBar } from './use-xi-bar'

const act = 'inline-flex min-h-11 items-center rounded-lg border border-brand-black/20 bg-white px-3 text-sm font-semibold text-brand-black hover:bg-brand-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-black'
const actOn = 'inline-flex min-h-11 items-center rounded-lg border border-brand-black bg-brand-black px-3 text-sm font-semibold text-brand-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-black'
const card = 'rounded-xl bg-white ring-1 ring-brand-black/10'
const chip = 'rounded-full bg-brand-black/5 px-2 py-0.5 text-xs font-semibold text-brand-black'

/**
 * The suggested XI as a vertical list: a reason under every name, toggles that only change the address (no client state), Reserves
 * and Left out accordions, and the sticky "Use this XI" bar (the one client piece). Server-rendered, selector pages only.
 */
export function XiSuggestion({ view, gameId }: { view: SuggestionView; gameId: string }) {
  const { result, state } = view
  const s: XiState = state
  const href = (next: XiState) => suggestHref(gameId, next)
  const blocking = view.warnings.filter((w) => w.blocking)
  const hasOverrides = s.pins.length + s.leaves.length > 0 || s.keeperId != null

  return (
    <div className="pb-28 sm:pb-24">
      <p className="mt-3 text-sm text-brand-grey">
        {result.picks.length} of {result.size} places filled from {result.picks.length + result.reserves.length + result.excluded.length} players in the squad. Chosen by the ordered rules below, not by a score.
      </p>

      {result.notes.length > 0 && (
        <ul aria-label="Notes" className="mt-3 space-y-2">
          {result.notes.map((n, i) => <li key={i} className="rounded-lg bg-brand-gold-pale px-3 py-2 text-sm text-brand-black ring-1 ring-brand-gold/30">{n}</li>)}
        </ul>
      )}
      {view.warnings.length > 0 && (
        <ul aria-label="Warnings" className="mt-3 space-y-2">
          {view.warnings.map((w, i) => (
            <li key={i} className={`rounded-lg px-3 py-2 text-sm ring-1 ${w.blocking || w.strong ? 'bg-status-bad-soft text-status-bad-ink ring-status-bad/25' : 'bg-brand-gold-pale text-brand-black ring-brand-gold/30'}`}>
              <span className="font-semibold">{w.blocking ? 'Fix before publishing: ' : w.strong ? 'Check: ' : ''}</span>{w.text}
            </li>
          ))}
        </ul>
      )}

      <div className={`${card} mt-4 p-3`}>
        <p className="text-sm font-bold text-brand-black">Compared with the saved team</p>
        {view.savedCount === 0 ? (
          <p className="mt-1 text-sm text-brand-grey">No team is saved for this game yet.</p>
        ) : view.changes.length === 0 ? (
          <p className="mt-1 text-sm text-brand-grey">Same as the saved team ({view.savedCount} places).</p>
        ) : (
          <ul className="mt-1 list-disc pl-5 text-sm text-brand-charcoal">{view.changes.map((c, i) => <li key={i}>{c}</li>)}</ul>
        )}
      </div>

      <h2 className="mt-6 text-lg font-bold text-brand-black">Suggested team</h2>
      {hasOverrides && <p className="mt-1"><Link href={href({ pins: [], leaves: [], keeperId: null })} className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-black underline underline-offset-4">Clear my changes</Link></p>}
      {result.picks.length === 0 ? (
        <p className="mt-2 rounded-xl bg-white p-4 text-brand-grey ring-1 ring-brand-black/10">Nobody is available to suggest. Check the squad and the availability page.</p>
      ) : (
        <ol className="mt-2 space-y-2">
          {result.picks.map((p) => (
            <li key={p.id} className={`${card} p-3`}>
              <div className="flex items-start gap-3">
                <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-brand-black/20 text-lg font-bold tabular-nums text-brand-black">{p.order}</span>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-base font-bold text-brand-black"><span className="sr-only">Batting position {p.order}: </span>{p.name}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className={chip}>{ROLE_LABEL[p.role]}</span>
                    {p.isKeeper && p.role !== 'keeper' && <span className={chip}>Keeper</span>}
                    {p.pinned && <span className={chip}>Pinned by you</span>}
                    {p.medianPosition != null ? <span className="text-xs text-brand-grey">Usually bats {p.medianPosition}</span> : <span className="text-xs text-brand-grey">Order not suggested</span>}
                  </p>
                  <p className="mt-1 text-sm text-brand-charcoal">{p.reason}</p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Link href={href(keeperState(s, p.id))} aria-label={s.keeperId === p.id ? `Clear ${p.name} as your chosen keeper` : p.isKeeper ? `Lock in ${p.name} as the keeper` : `Make ${p.name} the keeper`} className={s.keeperId === p.id ? actOn : act}>{s.keeperId === p.id ? 'Keeper (yours)' : p.isKeeper ? 'Lock keeper' : 'Keeper'}</Link>
                <Link href={href(pinned(s, p.id))} aria-label={`${p.pinned ? 'Stop pinning' : 'Pin'} ${p.name}`} className={p.pinned ? actOn : act}>{p.pinned ? 'Pinned' : 'Must play'}</Link>
                <Link href={href(left(s, p.id))} aria-label={`Leave ${p.name} out`} className={`${act} ml-auto text-status-bad-ink`}>Leave out</Link>
              </div>
            </li>
          ))}
        </ol>
      )}

      <details className={`${card} mt-4`}>
        <summary className="flex min-h-11 cursor-pointer items-center px-3 text-base font-bold text-brand-black">Reserves ({result.reserves.length})</summary>
        <ul className="space-y-2 px-3 pb-3">
          {result.reserves.length === 0 && <li className="text-sm text-brand-grey">Nobody else is available.</li>}
          {result.reserves.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 border-t border-brand-black/10 pt-2">
              <div className="min-w-0 flex-1"><p className="font-semibold text-brand-black">{r.name}</p><p className="text-sm text-brand-charcoal">{r.reason}</p></div>
              <Link href={href(pinned(s, r.id))} aria-label={`Must play: ${r.name}`} className={act}>Must play</Link>
            </li>
          ))}
        </ul>
      </details>

      <details className={`${card} mt-3`}>
        <summary className="flex min-h-11 cursor-pointer items-center px-3 text-base font-bold text-brand-black">Left out ({result.excluded.length})</summary>
        <ul className="space-y-2 px-3 pb-3">
          {result.excluded.length === 0 && <li className="text-sm text-brand-grey">Nobody is left out.</li>}
          {result.excluded.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-2 border-t border-brand-black/10 pt-2">
              <div className="min-w-0 flex-1"><p className="font-semibold text-brand-black">{x.name}</p><p className="text-sm text-brand-charcoal">{x.reason}</p></div>
              {x.code === 'left-out' ? (
                <Link href={href(left(s, x.id))} aria-label={`Put ${x.name} back`} className={act}>Put back</Link>
              ) : (
                <Link href={href(pinned(s, x.id))} aria-label={`Must play: ${x.name}`} className={act}>Must play</Link>
              )}
            </li>
          ))}
        </ul>
      </details>

      <details className={`${card} mt-3`}>
        <summary className="flex min-h-11 cursor-pointer items-center px-3 text-base font-bold text-brand-black">How this team is chosen</summary>
        <div className="space-y-2 px-3 pb-3 text-sm text-brand-charcoal">
          <p>The rules run in this order. Nothing is scored; every reason above is a recorded fact.</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>The pool is this grade’s squad for the season. Players who said they are out, are already picked in another grade that day, or were left out by you are not picked.{view.rules.treatNoAnswerAsMaybe ? ' Players who have not answered count as maybe.' : ' Players who have not answered are left out.'}</li>
            <li>{view.rules.requireKeeper ? 'A keeper first,' : 'No keeper is required,'} then at least {view.rules.minBowlers} bowling options, then at least {view.rules.minBatters} batters (an all-rounder counts as both), then the best of the rest until the team is full.</li>
            <li>Inside each step: in before maybe before no answer; players with at least {SELECTION.xi.minFormEntries} recent innings or spells before those with fewer; then the last five (runs for batting, wickets then runs conceded for bowling); then games this season; then name.</li>
            <li>Batting order is from each player’s stored batting positions over their last five innings, only for players with at least {SELECTION.xi.orderMinInnings} of them. Anyone else is placed last.</li>
            <li>The captain is not suggested; set C and WK in the team builder. Changing the numbers above is an admin job in Advanced, Selection settings.</li>
          </ol>
        </div>
      </details>

      <UseXiBar gameId={gameId} revision={view.revision} playerIds={result.picks.map((p) => p.id)} size={result.size} keeperId={result.keeperId} captainId={view.captainId} hasSaved={view.savedCount > 0} published={view.published} blocked={blocking[0]?.text ? `Needs fixing before it can be published: ${blocking[0].text}` : ''} />
    </div>
  )
}
