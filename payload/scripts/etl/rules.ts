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

/**
 * Ids of rows whose `url` an earlier (lower-id) kept row already has. Event photos skip them
 * (a resubmission; `legacyUrl` is unique there). Documents and gallery photos keep every row:
 * the first owns the file, each later one gets a copy of it (media.ts `dupCopyName`).
 */
export function duplicateUrlIds(rows: readonly LegacyRow[], keep: (r: LegacyRow) => boolean): Set<number> {
  const seen = new Set<string>()
  const dups = new Set<number>()
  for (const r of rows.filter(keep).sort((a, b) => Number(a.id) - Number(b.id))) {
    if (typeof r.url !== 'string' || !r.url) continue
    if (seen.has(r.url)) dups.add(Number(r.id))
    else seen.add(r.url)
  }
  return dups
}

/** An event photo the legacy app would import at all: its event imports and its status is known. */
export const eventPhotoImportable = (eventIds: ReadonlySet<number>) => (r: LegacyRow) =>
  eventIds.has(Number(r.event_id)) && EVENT_PHOTO_STATUSES.has(r.status as string)

/**
 * Legacy rows each id-preserving collection is expected to hold, given the parents' imported ids.
 * An event photo whose URL an earlier imported photo already has is a resubmission (the legacy
 * `rejectEventPhoto` exists for exactly this) and is skipped, not imported without a file.
 */
export function expectedRows(parents: {
  eventIds: ReadonlySet<number>
  playerIds: ReadonlySet<number>
  eventPhotos?: readonly LegacyRow[]
}): Record<string, (r: LegacyRow) => boolean> {
  const { eventIds, playerIds } = parents
  const photoImportable = eventPhotoImportable(eventIds)
  const photoDuplicates = duplicateUrlIds(parents.eventPhotos ?? [], photoImportable)
  return {
    documents: () => true,
    'gallery-photos': () => true,
    sponsors: () => true,
    people: () => true,
    announcements: () => true,
    events: importsEvent,
    'event-rsvps': (r) => eventIds.has(Number(r.event_id)) && RSVP_RESPONSES.has(r.response as string),
    'event-photos': (r) => photoImportable(r) && !photoDuplicates.has(Number(r.id)),
    stories: (r) => STORY_STATUSES.has(r.status as string),
    players: importsPlayer,
    'player-seasons': (r) => playerIds.has(Number(r.player_id)),
    'player-sync-runs': (r) => SYNC_RUN_STATUSES.has(r.status as string),
  }
}
