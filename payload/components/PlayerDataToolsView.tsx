import { SetStepNav } from '@payloadcms/ui'
import type { AdminViewServerProps } from 'payload'
import { listImportBatches } from '@/lib/history-import/server'
import { getDuplicateSuggestions, getRecentMerges } from '@/lib/players/duplicate-queries'
import { isAdminUser } from '../admin/visibility'
import { AdminPage, requireUser } from './AdminPage'
import { DuplicatePlayersPanel, type PairView } from './DuplicatePlayersPanel'
import { HistoryImportPanel } from './HistoryImportPanel'

/**
 * `/admin/player-data-tools` (custom view, admins only; W2 spec 6.1 and 6.2): import and export of historical player data,
 * and the ranked list of players who may be the same person, with merge, "not the same person" and undo.
 */
export async function PlayerDataToolsView(view: AdminViewServerProps) {
  requireUser(view, '/player-data-tools')
  const { req } = view.initPageResult
  const api = req.payload.config.routes.api
  if (!isAdminUser(req.user)) {
    return (
      <AdminPage view={view}>
        <h1 className="club-page__title">Player data tools</h1>
        <p className="club-page__lead">Only the person who looks after the site can use these tools.</p>
      </AdminPage>
    )
  }

  const [batches, suggestions, merges] = await Promise.all([
    listImportBatches(req.payload).catch(() => []),
    getDuplicateSuggestions().catch(() => null),
    getRecentMerges().catch(() => []),
  ])
  const pairs: PairView[] | null = suggestions
    ? suggestions.map((s) => {
        const view = (p: typeof s.a) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`.trim(), games: p.games, hidden: p.hidden, seasons: p.seasons.length })
        const [a, b] = [view(s.a), view(s.b)]
        // The profile with more games is kept by default.
        const keep = b.games > a.games ? b : a
        return { key: `${a.id}-${b.id}`, a, b, keepId: keep.id, score: s.score, reasons: s.reasons }
      })
    : null

  return (
    <AdminPage view={view}>
      <SetStepNav nav={[{ label: 'Player data tools' }]} />
      <h1 className="club-page__title">Player data tools</h1>
      <p className="club-page__lead">Bring in older seasons from spreadsheets, and tidy up players who appear twice.</p>
      <section id="import" aria-labelledby="pdt-import" className="club-field">
        <h2 id="pdt-import" className="club-field__title">Import and export history</h2>
        <HistoryImportPanel api={api} batches={batches} />
      </section>
      <section id="duplicates" aria-labelledby="pdt-dup" className="club-field">
        <h2 id="pdt-dup" className="club-field__title">Duplicate players</h2>
        <DuplicatePlayersPanel
          api={api}
          adminRoute={req.payload.config.routes.admin}
          pairs={pairs}
          merges={merges.map((m) => ({ id: m.id, sourceName: m.sourceName, targetName: m.targetName, at: m.at, undoable: m.undoable, status: m.status }))}
        />
      </section>
    </AdminPage>
  )
}
