'use client'

import { Button, toast } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  addMissingPlayersAction, closeSeasonAction, markRoundScoredAction, openSeasonAction, recalculatePricesAction, removeEntryAction, renameEntryAction,
  resetPinAction, rotateLinkAction, saveRulesAction, searchManagersAction, setAvailableAction, setBlockedWordsAction, setDisabledAction, setPriceAction,
  setSwitchAction, setUpSeasonAction, type ActionResult,
} from '@/lib/fantasy/admin-actions'
import type { AdminData } from '@/lib/fantasy/admin-view'
import { credits, RULE_NUMBER_KEYS, SCORING_KEYS, SCORING_LABELS } from '@/lib/fantasy/rules'

const RULE_LABELS: Record<(typeof RULE_NUMBER_KEYS)[number], string> = {
  maxEntries: 'Most teams', squadSize: 'Players in a squad', salaryCapTenths: 'Salary cap (tenths of a credit, 1000 = 100.0)', captainMultiplier: 'Captain counts this many times',
  transfersPerRound: 'Players that can change each round (0 = any number)', minPriceTenths: 'Lowest price (tenths)', maxPriceTenths: 'Highest price (tenths)',
  priceSeasonsBack: 'Past seasons used for prices', priorGames: 'Weight of the average when a player has few games', minGamesForPrice: 'Games before a price is fully trusted',
}

type Manager = { id: number; teamName: string; joined: string; disabled: boolean }

/** The Fantasy cricket view's controls. Every button calls a server action that re-checks the role; the page only hides what the role cannot use. */
export function FantasyPanel({ data, csvHref }: { data: AdminData; csvHref: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [rules, setRules] = useState(() => (data.season ? { ...data.season.rules, scoring: { ...data.season.rules.scoring } } : null))
  const [year, setYear] = useState(data.defaultYear)
  const [seasonName, setSeasonName] = useState(`${data.defaultYear} season`)
  const [name, setName] = useState(data.settings.competitionName)
  const [scoredRound, setScoredRound] = useState('')
  const [scoredReason, setScoredReason] = useState('')
  const [q, setQ] = useState('')
  const [managers, setManagers] = useState<Manager[] | null>(null)
  const [reset, setReset] = useState<{ teamName: string; pin: string } | null>(null)
  const [words, setWords] = useState((data.season?.blockedWords ?? []).join(', '))
  const [draftPrice, setDraftPrice] = useState<Record<number, string>>({})

  const run = async <T extends object>(fn: () => Promise<ActionResult<T>>, ok: string): Promise<ActionResult<T> | null> => {
    setBusy(true)
    try {
      const r = await fn()
      if (r.ok) {
        if (ok) toast.success(ok)
        router.refresh()
      } else toast.error(r.message)
      return r
    } catch {
      toast.error('That did not work. Please try again.')
      return null
    } finally {
      setBusy(false)
    }
  }
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Link copied.')
    } catch {
      toast.error('Could not copy. Select the link and copy it by hand.')
    }
  }
  const search = async (text: string) => {
    setQ(text)
    setManagers(await searchManagersAction({ q: text }))
  }
  const season = data.season
  const draft = season?.status === 'draft'
  const message = data.shareUrl ? `Join the club fantasy game: ${data.shareUrl}` : ''

  return (
    <div className="club-stack">
      {!season && data.isAdmin && (
        <form className="club-panel" onSubmit={(e) => { e.preventDefault(); void run(() => setUpSeasonAction({ year, name: seasonName }), 'Season set up. Check the rules and prices, then open it.') }}>
          <h2 className="club-field__title">Set up a season</h2>
          <p className="club-muted">This creates the season with the standard rules and works out every senior player&rsquo;s price from past seasons. You check them, then open the season. Nothing is public until you do.</p>
          <div className="club-actions">
            <label><span className="club-muted">Season starts in</span><br /><input type="number" value={year} min={2000} max={2200} onChange={(e) => setYear(Number(e.target.value))} required /></label>
            <label><span className="club-muted">Name</span><br /><input type="text" value={seasonName} maxLength={60} onChange={(e) => setSeasonName(e.target.value)} required /></label>
            <Button buttonStyle="primary" type="submit" disabled={busy}>Set up season</Button>
          </div>
        </form>
      )}
      {!season && !data.isAdmin && <p className="club-attention__none">An administrator needs to set up the season first.</p>}

      {season && (
        <section className="club-panel" aria-labelledby="fx-week">
          <h2 className="club-field__title" id="fx-week">This week</h2>
          <p>{season.name}: <strong>{season.status === 'open' ? 'open' : season.status === 'draft' ? 'draft (not public yet)' : 'closed'}</strong>.{' '}
            {data.settings.enabled ? 'The game is switched on.' : 'The game is switched off, so none of its pages show.'}</p>
          {data.shareUrl ? (
            <>
              <p className="club-muted">Share this link with members. It is the only way in. Anyone with it can join, so do not post it publicly.</p>
              <p><input type="text" readOnly value={data.shareUrl} onFocus={(e) => e.currentTarget.select()} style={{ width: '100%' }} aria-label="Join link" /></p>
              <div className="club-actions">
                <Button buttonStyle="primary" size="small" type="button" onClick={() => copy(data.shareUrl!)}>Copy link</Button>
                <a className="club-button-link" href={`sms:?&body=${encodeURIComponent(message)}`}>Share by text message</a>
                <a className="club-button-link" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">Share on WhatsApp</a>
              </div>
            </>
          ) : (
            <p className="club-muted">The join link appears here once the season is open and the game is switched on.</p>
          )}
          {data.thisWeek ? (
            <p>Next lock: <strong>{data.thisWeek.label}</strong>, squads close {data.thisWeek.lockText}. {data.thisWeek.saved} of {data.thisWeek.total} teams have picked a squad for this round; the others keep last round&rsquo;s team.</p>
          ) : (
            <p className="club-muted">No round is open for changes.</p>
          )}
          <div className="club-actions">
            <label className="club-muted"><input type="checkbox" checked={data.settings.publicLeaderboard} disabled={busy} onChange={(e) => void run(() => setSwitchAction({ publicLeaderboard: e.target.checked }), e.target.checked ? 'The leaderboard is public.' : 'The leaderboard is for members only.')} /> Show the leaderboard to everyone</label>
            {data.isAdmin && <label className="club-muted"><input type="checkbox" checked={data.settings.enabled} disabled={busy} onChange={(e) => void run(() => setSwitchAction({ enabled: e.target.checked }), e.target.checked ? 'Fantasy cricket is on.' : 'Fantasy cricket is off.')} /> Fantasy cricket is on</label>}
          </div>
          {data.isAdmin && data.rounds.some((r) => r.status === 'locked') && (
            <form className="club-actions" onSubmit={(e) => { e.preventDefault(); void run(() => markRoundScoredAction({ round: scoredRound, reason: scoredReason }), 'Round marked scored.') }}>
              <label><span className="club-muted">Close a round that cannot finish</span><br />
                <select value={scoredRound} onChange={(e) => setScoredRound(e.target.value)} required>
                  <option value="">Choose a round</option>
                  {data.rounds.filter((r) => r.status === 'locked').map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                </select></label>
              <label><span className="club-muted">Why (for example washed out)</span><br /><input type="text" value={scoredReason} maxLength={200} onChange={(e) => setScoredReason(e.target.value)} required /></label>
              <Button buttonStyle="secondary" size="small" type="submit" disabled={busy}>Mark round scored</Button>
            </form>
          )}
        </section>
      )}

      {season && data.isAdmin && rules && (
        <details className="club-panel" open={draft}>
          <summary className="club-field__title">Rules and scoring {draft ? '(you can change these until you open the season)' : '(fixed)'}</summary>
          <div className="club-stack">
            <div className="club-actions">
              {RULE_NUMBER_KEYS.map((k) => (
                <label key={k}><span className="club-muted">{RULE_LABELS[k]}</span><br />
                  <input type="number" value={rules[k]} disabled={!draft} onChange={(e) => setRules({ ...rules, [k]: Number(e.target.value) })} /></label>
              ))}
            </div>
            <div className="club-actions">
              {SCORING_KEYS.map((k) => (
                <label key={k}><span className="club-muted">{SCORING_LABELS[k]}</span><br />
                  <input type="number" value={rules.scoring[k]} disabled={!draft} onChange={(e) => setRules({ ...rules, scoring: { ...rules.scoring, [k]: Number(e.target.value) } })} /></label>
              ))}
            </div>
            {draft && (
              <div className="club-actions">
                <Button buttonStyle="primary" size="small" type="button" disabled={busy} onClick={() => void run(() => saveRulesAction({ patch: rules }), 'Rules saved.')}>Save rules</Button>
                <Button buttonStyle="secondary" size="small" type="button" disabled={busy} onClick={() => void run(() => recalculatePricesAction(), 'Prices recalculated.')}>Recalculate prices</Button>
                <Button buttonStyle="primary" size="small" type="button" disabled={busy} onClick={() => { if (window.confirm('Open the season? The rules are fixed once it is open, and the game goes live when it is switched on.')) void run(() => openSeasonAction(), 'The season is open.') }}>Open season</Button>
              </div>
            )}
            {season.status === 'open' && <div className="club-actions"><Button buttonStyle="secondary" size="small" type="button" disabled={busy} onClick={() => { if (window.confirm('Close the season? The game goes off for everyone.')) void run(() => closeSeasonAction(), 'The season is closed.') }}>Close season</Button></div>}
          </div>
        </details>
      )}

      {season && data.isAdmin && (
        <details className="club-panel">
          <summary className="club-field__title">Prices ({data.prices.length} players)</summary>
          <p className="club-muted">Prices are worked out for you from past seasons and need no action. A price is a ranking of points per game, not a rating of how good a player is. Change one only if it looks wrong; a player who is off sick or has left can be taken out of the game.</p>
          <div className="club-actions"><Button buttonStyle="secondary" size="small" type="button" disabled={busy} onClick={() => void run(() => addMissingPlayersAction(), 'Added any missing players.')}>Add missing players</Button></div>
          <table className="club-table">
            <thead><tr><th>Player</th><th>Price</th><th>Games</th><th>In the game</th></tr></thead>
            <tbody>
              {data.prices.map((p) => (
                <tr key={p.playerId}>
                  <td><p className="club-table__strong">{p.name}</p><p className="club-muted">{p.perGame !== null ? `${p.perGame} pts/game` : 'no games'}{p.thin ? ', thin data' : ''}{p.overridden ? `, set by hand (auto ${credits(p.autoPriceTenths)})` : ''}</p></td>
                  <td>
                    <input type="number" step={5} aria-label={`Price for ${p.name} in tenths`} value={draftPrice[p.playerId] ?? String(p.priceTenths)} onChange={(e) => setDraftPrice({ ...draftPrice, [p.playerId]: e.target.value })} style={{ width: '5rem' }} />
                    <Button buttonStyle="secondary" size="small" type="button" disabled={busy} onClick={() => void run(() => setPriceAction({ playerId: p.playerId, tenths: Number(draftPrice[p.playerId] ?? p.priceTenths) }), 'Price saved.')}>Save</Button>
                    {p.overridden && <Button buttonStyle="secondary" size="small" type="button" disabled={busy} onClick={() => void run(() => setPriceAction({ playerId: p.playerId, tenths: null }), 'Back to the worked-out price.')}>Reset</Button>}
                  </td>
                  <td>{p.games ?? 0}</td>
                  <td><input type="checkbox" aria-label={`${p.name} is in the game`} checked={p.available} disabled={busy} onChange={(e) => void run(() => setAvailableAction({ playerId: p.playerId, available: e.target.checked }), '')} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      {season && (
        <details className="club-panel">
          <summary className="club-field__title">Rounds ({data.rounds.length})</summary>
          {data.rounds.length === 0 ? <p className="club-muted">Rounds appear once the fixtures are loaded.</p> : (
            <table className="club-table">
              <thead><tr><th>Round</th><th>Locks</th><th>Status</th></tr></thead>
              <tbody>
                {data.rounds.map((r) => (
                  <tr key={r.key}><td>{r.label}</td><td>{r.lockText}</td><td>{r.status === 'scored' ? (r.closedByCommittee ? `Closed by the committee${r.reason ? ` (${r.reason})` : ''}` : 'Scored') : r.status === 'locked' ? 'Locked, points not final' : 'Open for changes'}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </details>
      )}

      {season && (
        <details className="club-panel">
          <summary className="club-field__title">Teams ({data.managers})</summary>
          <p className="club-muted">Find a team by name. You see the name and the join date only. A forgotten PIN is fixed by Reset PIN: it makes a temporary PIN that you read out once; the team must then choose its own.</p>
          <label><span className="club-muted">Search by team name</span><br /><input type="search" value={q} onChange={(e) => void search(e.target.value)} autoComplete="off" /></label>
          {reset && (
            <div className="club-panel" role="status">
              <h3 className="club-field__title">Temporary PIN for {reset.teamName}</h3>
              <p style={{ fontSize: '2rem', letterSpacing: '0.2em' }}><strong>{reset.pin}</strong></p>
              <p className="club-muted">Give it to the team now. It is not saved anywhere you can look it up again.</p>
              <Button buttonStyle="secondary" size="small" type="button" onClick={() => setReset(null)}>Done</Button>
            </div>
          )}
          {managers && (managers.length === 0 ? <p className="club-muted">No team matches.</p> : (
            <table className="club-table">
              <thead><tr><th>Team</th><th>Joined</th><th aria-label="Actions" /></tr></thead>
              <tbody>
                {managers.map((m) => (
                  <tr key={m.id}>
                    <td>{m.teamName}{m.disabled ? ' (hidden)' : ''}</td><td>{m.joined}</td>
                    <td><div className="club-actions">
                      <Button buttonStyle="secondary" size="small" type="button" disabled={busy} onClick={() => { if (window.confirm(`Reset the PIN for ${m.teamName}?`)) void run(async () => { const r = await resetPinAction({ entryId: m.id }); if (r.ok) setReset({ teamName: r.teamName, pin: r.tempPin }); return r }, '') }}>Reset PIN</Button>
                      <Button buttonStyle="secondary" size="small" type="button" disabled={busy} onClick={() => void run(() => setDisabledAction({ entryId: m.id, disabled: !m.disabled }), m.disabled ? 'Shown again.' : 'Hidden from the leaderboard.').then(() => search(q))}>{m.disabled ? 'Show again' : 'Hide'}</Button>
                      <Button buttonStyle="secondary" size="small" type="button" disabled={busy} onClick={() => { const n = window.prompt('New team name', m.teamName); if (n) void run(() => renameEntryAction({ entryId: m.id, name: n }), 'Renamed.').then(() => search(q)) }}>Rename</Button>
                      <Button buttonStyle="secondary" size="small" type="button" disabled={busy} onClick={() => { if (window.confirm(`Remove ${m.teamName} and its squads? This cannot be undone.`)) void run(() => removeEntryAction({ entryId: m.id }), 'Removed.').then(() => search(q)) }}>Remove</Button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </details>
      )}

      {season && (
        <details className="club-panel">
          <summary className="club-field__title">Name, words and the join link</summary>
          <form className="club-actions" onSubmit={(e) => { e.preventDefault(); void run(() => setSwitchAction({ competitionName: name }), 'Name saved.') }}>
            <label><span className="club-muted">Name of the game</span><br /><input type="text" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} /></label>
            <Button buttonStyle="secondary" size="small" type="submit" disabled={busy}>Save name</Button>
          </form>
          <form className="club-actions" onSubmit={(e) => { e.preventDefault(); void run(() => setBlockedWordsAction({ words: words.split(',') }), 'Words saved.') }}>
            <label><span className="club-muted">Words not allowed in team names (comma separated)</span><br /><input type="text" value={words} onChange={(e) => setWords(e.target.value)} style={{ width: '24rem', maxWidth: '100%' }} /></label>
            <Button buttonStyle="secondary" size="small" type="submit" disabled={busy}>Save words</Button>
          </form>
          {data.isAdmin && (
            <div className="club-actions">
              <Button buttonStyle="secondary" size="small" type="button" disabled={busy} onClick={() => { if (window.confirm('Make a new join link? The old link stops working and everyone has to sign in again with their PIN.')) void run(() => rotateLinkAction(), 'New link made. Share the new one.') }}>Make a new join link</Button>
              <a className="club-button-link" href={csvHref}>Download leaderboard (CSV)</a>
            </div>
          )}
        </details>
      )}

      {season && data.leaderboardPreview.length > 0 && (
        <section className="club-panel" aria-labelledby="fx-top">
          <h2 className="club-field__title" id="fx-top">Top of the leaderboard</h2>
          <table className="club-table"><tbody>{data.leaderboardPreview.map((r) => <tr key={r.rank}><td>{r.rank}</td><td>{r.teamName}</td><td>{r.total}</td></tr>)}</tbody></table>
        </section>
      )}
    </div>
  )
}
