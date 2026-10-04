/**
 * Shared constants of the historical import (W2 spec 6.1). Pure: no database, no Next imports.
 *
 * Imported season rows carry a `seasonOrder` far above any PlayHQ value (PlayHQ numbers its season groups 0, 1, 2 ...), so
 * every view that sorts by `seasonOrder` puts them below the PlayHQ seasons, and older imported years sort after newer ones
 * (`BASE - startYear`). They never count as the "current" season.
 */
export const IMPORTED_SEASON_ORDER_BASE = 100_000
/** Anything at or above this is an imported season (PlayHQ order numbers are small integers). */
export const IMPORTED_SEASON_ORDER_MIN = 50_000

export const importedSeasonOrder = (seasonStartYear: number): number => IMPORTED_SEASON_ORDER_BASE - seasonStartYear
export const isImportedSeasonOrder = (seasonOrder: number): boolean => seasonOrder >= IMPORTED_SEASON_ORDER_MIN

/** Synthetic team id of an imported season row; the existing unique `(player, teamId)` index makes a re-import an upsert. */
export const importedSeasonTeamId = (season: string, teamSlug: string): string => `import:${season}:${teamSlug}`
export const IMPORT_GAME_PREFIX = 'imp:'
