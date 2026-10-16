import { memberIsJunior, shortNameFor, displayNameFor, type JuniorSource, type NameSource, type MemberRole } from './members'

/**
 * Scoped name projections for editors (wave D spec section 1). An editor never reads member contact data; a screen that needs to
 * pick a person gets `{ id, displayName }` for the members relevant to that screen only. A junior is shown as first name and last
 * initial ("Sam T."). There is deliberately no "all members" projection.
 */
export const NAME_SCREENS = ['roster', 'stock', 'actions'] as const
export type NameScreen = (typeof NAME_SCREENS)[number]

/** Roles that make a member relevant to each screen. Seat holders for `actions` are added when committee seats exist (WP-4). */
export const SCREEN_ROLES: Record<NameScreen, readonly MemberRole[]> = {
  roster: ['volunteer', 'committee'],
  stock: ['player', 'volunteer', 'committee', 'coach'],
  actions: ['committee'],
}

export const isNameScreen = (v: unknown): v is NameScreen => typeof v === 'string' && (NAME_SCREENS as readonly string[]).includes(v)

export type NameRow = NameSource & JuniorSource & { id: number; roles?: readonly string[] | null; status?: string | null }
export type ProjectedName = { id: number; displayName: string }

/** Pure: which rows belong to the screen, with juniors shortened. Output keys are exactly `id` and `displayName`. */
export function projectNames(rows: readonly NameRow[], screen: NameScreen, today: string): ProjectedName[] {
  const wanted = SCREEN_ROLES[screen] as readonly string[]
  return rows
    .filter((r) => r.status !== 'past' && !r.erasedAt && (r.roles ?? []).some((role) => wanted.includes(role)))
    .map((r) => ({ id: r.id, displayName: memberIsJunior(r, today) ? shortNameFor(r) : displayNameFor(r) }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
}
