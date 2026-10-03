import { clubDefaults } from '../seed/club-defaults'

/** Nav icon (spec §9): the crest in a small white tile. */
export function Icon() {
  return (
    <span className="club-icon">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={clubDefaults.assets.logo} alt={`${clubDefaults.shortName} crest`} width={20} height={25} />
    </span>
  )
}
