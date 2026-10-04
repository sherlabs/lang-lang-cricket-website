import { getClub } from '@/lib/club'
import { getTheme } from '@/lib/theme'

/** Nav icon (spec §9): the themed crest in a small white tile. */
export async function Icon() {
  const [theme, club] = await Promise.all([getTheme(), getClub()])
  return (
    <span className="club-icon">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={theme.crest.url} alt={`${club.shortName} crest`} width={20} height={25} />
    </span>
  )
}
