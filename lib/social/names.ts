/**
 * Public names for the graphics (wave G spec WP-2b). A picture shows the team as the public sees it (the club's short name and the
 * grade label), never PlayHQ's internal team name. Pure and club-agnostic: the club name and the PlayHQ team prefix are arguments
 * (from the club global and `PLAYHQ_DEFAULTS.teamNamePrefix`), and no club's naming is written here.
 */

/** A grade label without its competition numbering ("2. District" becomes "District"): a leading ordinal and dot only. */
export const displayGrade = (raw: string | null | undefined): string => (raw ?? '').replace(/\s+/g, ' ').trim().replace(/^\d+\s*\.\s*/, '').trim()

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * What to call the club's team on a picture. A team named the way PlayHQ names it (it starts with the configured team prefix, or has no
 * name at all) becomes `<club short name> <grade label>`; a name that does not start with the prefix is already a team's own name and
 * is kept as it is.
 */
export function publicTeamName(input: { team?: string | null; grade?: string | null; clubName: string; teamPrefix?: string | null }): string {
  const club = input.clubName.replace(/\s+/g, ' ').trim()
  const grade = displayGrade(input.grade)
  const team = (input.team ?? '').replace(/\s+/g, ' ').trim()
  const prefix = (input.teamPrefix ?? '').replace(/\s+/g, ' ').trim()
  const internal = team === '' || (prefix !== '' && new RegExp(`^${escapeRe(prefix)}(?![A-Za-z0-9])`, 'i').test(team))
  if (!internal) return team
  const rest = team.replace(new RegExp(`^${escapeRe(prefix)}[\\s\\-–—:|]*`, 'i'), '').trim()
  return [club, grade || displayGrade(rest)].filter(Boolean).join(' ')
}
