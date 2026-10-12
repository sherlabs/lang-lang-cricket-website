import { isJunior } from '../social/eligibility'

/** Roles a member can hold; one person can hold several. Labels are plain English for the committee. */
export const MEMBER_ROLES = ['player', 'parent', 'life-member', 'volunteer', 'sponsor-contact', 'committee', 'coach', 'supporter', 'other'] as const
export type MemberRole = (typeof MEMBER_ROLES)[number]
export const ROLE_LABELS: Record<MemberRole, string> = {
  player: 'Player',
  parent: 'Parent or guardian',
  'life-member': 'Life member',
  volunteer: 'Volunteer',
  'sponsor-contact': 'Sponsor contact',
  committee: 'Committee',
  coach: 'Coach',
  supporter: 'Supporter',
  other: 'Other',
}
export const isMemberRole = (v: unknown): v is MemberRole => typeof v === 'string' && (MEMBER_ROLES as readonly string[]).includes(v)

export const MEMBER_STATUSES = ['active', 'past'] as const
export type MemberStatus = (typeof MEMBER_STATUSES)[number]
export const IMPORT_SOURCES = ['manual', 'players', 'csv'] as const

/** What the directory shows for a member whose personal details were removed. */
export const FORMER_MEMBER = 'Former member'

export type NameParts = { firstName?: string | null; lastName?: string | null; preferredName?: string | null; displayName?: string | null }
export type NameSource = NameParts & {
  /** A linked player (populated); its name wins over anything typed on the member. */
  player?: NameParts | null
  /** A linked committee or coach record; its single full-name field is the last fallback. */
  person?: { name?: string | null } | null
  erasedAt?: string | null
}

const clean = (v: string | null | undefined): string => (typeof v === 'string' ? v.trim() : '')

/** The one name shown for a member: "Former member" once erased, else the linked player's name, else the typed name. */
export function displayNameFor(m: NameSource): string {
  if (m.erasedAt) return FORMER_MEMBER
  const p = m.player
  if (p) {
    const fromPlayer = clean(p.displayName) || `${clean(p.firstName)} ${clean(p.lastName)}`.trim()
    if (fromPlayer) return fromPlayer
  }
  return clean(m.preferredName) || `${clean(m.firstName)} ${clean(m.lastName)}`.trim() || clean(m.person?.name) || 'Unnamed member'
}

/** "Sam T.": first name and last initial, the form editors see for a junior (wave D spec section 1). */
export function shortNameFor(m: NameSource): string {
  if (m.erasedAt) return FORMER_MEMBER
  const src = m.player && (clean(m.player.firstName) || clean(m.player.lastName)) ? m.player : m
  const first = clean(src.firstName) || clean(src.preferredName)
  const last = clean(src.lastName)
  if (!first && clean(m.person?.name)) {
    const [f, ...rest] = clean(m.person?.name).split(/\s+/)
    const l = rest[rest.length - 1]
    return l ? `${f} ${l.charAt(0).toUpperCase()}.` : f
  }
  if (!first) return displayNameFor(m)
  return last ? `${first} ${last.charAt(0).toUpperCase()}.` : first
}

export type JuniorSource = { dateOfBirth?: string | null; player?: { isJunior?: boolean | null } | null }

/** Junior by the socials rule (`isJunior`): a ticked flag on the linked player, or a date of birth under 18 (unreadable counts as junior). */
export function memberIsJunior(m: JuniorSource, onDate: string): boolean {
  return isJunior({ isJunior: m.player?.isJunior === true, dateOfBirth: m.dateOfBirth ?? null }, onDate)
}
