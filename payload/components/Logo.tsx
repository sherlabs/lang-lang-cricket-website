import { getTheme } from '@/lib/theme'
import { clubDefaults } from '../seed/club-defaults'

/**
 * Login/branding graphic (spec §9): the crest in a white rounded tile plus the short-name
 * wordmark. The crest comes from the theme (theme.crest, then the Club details logo, then the
 * bundled crest); the name is the seed default because the login screen must render without the club row.
 */
export async function Logo() {
  const theme = await getTheme()
  return (
    <span className="club-logo">
      <span className="club-logo__tile">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={theme.crest.url} alt={`${clubDefaults.name} crest`} width={48} height={60} />
      </span>
      <span className="club-logo__text">
        <span className="club-logo__eyebrow">{clubDefaults.name}</span>
        <span className="club-logo__title">Website Admin</span>
      </span>
    </span>
  )
}
