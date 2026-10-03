import { clubDefaults } from '../seed/club-defaults'

/**
 * Login/branding graphic (spec §9): the crest in a white rounded tile plus the short-name
 * wordmark. Read from the defaults module — the login screen has no DB access guarantee.
 */
export function Logo() {
  return (
    <span className="club-logo">
      <span className="club-logo__tile">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={clubDefaults.assets.logo} alt={`${clubDefaults.name} crest`} width={48} height={60} />
      </span>
      <span className="club-logo__text">
        <span className="club-logo__eyebrow">{clubDefaults.shortName}</span>
        <span className="club-logo__title">Admin sign-in</span>
      </span>
    </span>
  )
}
