/**
 * One identity rule for individuals (spec 2026-10-04-people-sponsors-apparel-design.md).
 *
 * A person (committee, leadership, coach) may also be a player (`people.player`). Pure helpers,
 * no Payload or React imports, shared by the query layer, the components and the link script.
 *
 * - Photo: the player's own photo wins; otherwise the linked person's photo; otherwise initials.
 *   So the picture can be kept in ONE place (on the person) by leaving the player's empty.
 * - Name: never overridden. The player name is the PlayHQ stat identity (sync, aliases, merge).
 */

/** First letters of the first two words, upper-cased. '' for an empty name. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

/** First non-empty photo URL in priority order; '' when none (the avatar then shows initials). */
export function resolvePhotoUrl(...candidates: (string | null | undefined)[]): string {
  for (const c of candidates) if (typeof c === 'string' && c.trim() !== '') return c
  return ''
}

/** The slice of a linked person the player pages need. */
export type LinkedPerson = { id: number; name: string; role: string; section: string; photoUrl: string }

/**
 * Resolve what a player page shows, given the player's own photo and (if any) the person linked
 * to them. Name is the player's, always.
 */
export function resolvePlayerIdentity(
  player: { name: string; photoUrl: string },
  person: LinkedPerson | null | undefined,
): { name: string; photoUrl: string; clubRole: string | null } {
  return {
    name: player.name,
    photoUrl: resolvePhotoUrl(player.photoUrl, person?.photoUrl),
    clubRole: person?.role?.trim() ? person.role.trim() : null,
  }
}

/** Lowercase, accent-folded, punctuation and whitespace collapsed: the key for exact-name matching. */
export function normaliseName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}
