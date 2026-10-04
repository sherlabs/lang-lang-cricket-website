import { getTheme } from '@/lib/theme'
import { clubDefaults } from '../seed/club-defaults'

/** Nav icon (spec §9): the themed crest in a small white tile. */
export async function Icon() {
  const theme = await getTheme()
  return (
    <span className="club-icon">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={theme.crest.url} alt={`${clubDefaults.shortName} crest`} width={20} height={25} />
    </span>
  )
}
