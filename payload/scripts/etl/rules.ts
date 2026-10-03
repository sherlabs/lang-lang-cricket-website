/**
 * The ETL's skip rules, in one place: the steps apply them and verify re-derives the expected
 * target from them (spec §12.2). A row a rule rejects is skipped and reported, never coerced.
 */
import type { LegacyRow } from './source'

export const EVENT_TYPES = new Set(['one_time', 'recurring'])
export const RSVP_RESPONSES = new Set(['yes', 'no'])
export const EVENT_PHOTO_STATUSES = new Set(['approved', 'pending'])
export const STORY_STATUSES = new Set(['pending', 'published', 'rejected'])
export const PLAYER_SOURCES = new Set(['playhq', 'manual'])
export const SYNC_RUN_STATUSES = new Set(['running', 'ok', 'error'])

export const importsEvent = (r: { type?: unknown }) => EVENT_TYPES.has(r.type as string)
export const importsPlayer = (r: { source?: unknown }) => PLAYER_SOURCES.has(r.source as string)

/** Legacy ids the events step imports (children of any other event are orphans). */
export const importedEventIds = (events: readonly LegacyRow[]) => new Set(events.filter(importsEvent).map((e) => Number(e.id)))
/** Legacy ids the players step imports. */
export const importedPlayerIds = (players: readonly LegacyRow[]) => new Set(players.filter(importsPlayer).map((p) => Number(p.id)))

/** Legacy rows each id-preserving collection is expected to hold, given the parents' imported ids. */
export function expectedRows(parents: { eventIds: ReadonlySet<number>; playerIds: ReadonlySet<number> }): Record<string, (r: LegacyRow) => boolean> {
  const { eventIds, playerIds } = parents
  return {
    documents: () => true,
    'gallery-photos': () => true,
    sponsors: () => true,
    people: () => true,
    announcements: () => true,
    events: importsEvent,
    'event-rsvps': (r) => eventIds.has(Number(r.event_id)) && RSVP_RESPONSES.has(r.response as string),
    'event-photos': (r) => eventIds.has(Number(r.event_id)) && EVENT_PHOTO_STATUSES.has(r.status as string),
    stories: (r) => STORY_STATUSES.has(r.status as string),
    players: importsPlayer,
    'player-seasons': (r) => playerIds.has(Number(r.player_id)),
    'player-sync-runs': (r) => SYNC_RUN_STATUSES.has(r.status as string),
  }
}
