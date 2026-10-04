import { getClub } from '@/lib/club'
import { getTheme } from '@/lib/theme'

/**
 * Login/branding graphic (spec §9): the crest in a white rounded tile plus the short-name
 * wordmark. The crest comes from the theme (theme.crest, then the Club details logo, then the
 * bundled crest); the name is the club's name from Club details (`getClub()` falls back to the seed when the row or database is unavailable).
 */
export async function Logo() {
  const [theme, club] = await Promise.all([getTheme(), getClub()])
  return (
    <span className="club-logo">
      <span className="club-logo__tile">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={theme.crest.url} alt={`${club.name} crest`} width={48} height={60} />
      </span>
      <span className="club-logo__text">
        <span className="club-logo__eyebrow">{club.name}</span>
        <span className="club-logo__title">Website Admin</span>
      </span>
    </span>
  )
}
