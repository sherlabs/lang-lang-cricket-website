import type { BeforeListServerProps } from 'payload'
import { PlayerSyncButton } from './PlayerSyncButton'
import { CLUB_LOCALE, CLUB_TIMEZONE } from '@/config/site'

const melbourne = new Intl.DateTimeFormat(CLUB_LOCALE, {
  timeZone: CLUB_TIMEZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

const STATUS_LABEL: Record<string, string> = { ok: 'OK', running: 'Running', error: 'Error' }

/**
 * `players.admin.components.beforeList` (spec §9): the last `player-sync-runs` row (status,
 * finishedAt, players created, season rows, error) and a "Run sync now" button. Server
 * component: the run is read with the Local API on render (the list view is staff-only), and
 * the button's `router.refresh()` re-renders it.
 */
export async function PlayerSyncPanel({ payload }: BeforeListServerProps) {
  let run: { status?: string | null; startedAt?: string; finishedAt?: string | null; playersCreated?: number | null; seasonRows?: number | null; error?: string | null } | null = null
  try {
    const { docs } = await payload.find({ collection: 'player-sync-runs', sort: '-startedAt', limit: 1, depth: 0, overrideAccess: true })
    run = docs[0] ?? null
  } catch {
    run = null
  }
  const status = run?.status ?? ''
  return (
    <section className="club-sync-panel" aria-label="PlayHQ sync">
      <div className="club-sync-panel__status">
        <h3 className="club-field__title">PlayHQ sync</h3>
        {run ? (
          <p className="club-muted">
            <span className={`club-pill club-pill--${status || 'none'}`}>{STATUS_LABEL[status] ?? 'Unknown'}</span>{' '}
            {run.finishedAt ? (
              <>Finished {melbourne.format(new Date(run.finishedAt))}</>
            ) : run.startedAt ? (
              <>Started {melbourne.format(new Date(run.startedAt))}</>
            ) : null}
            {status === 'ok' && (
              <>
                {' '}— {run.playersCreated ?? 0} new players, {run.seasonRows ?? 0} season rows
              </>
            )}
          </p>
        ) : (
          <p className="club-muted">No sync has run yet.</p>
        )}
        {status === 'error' && run?.error && <p className="club-error">{run.error}</p>}
      </div>
      <PlayerSyncButton />
    </section>
  )
}
