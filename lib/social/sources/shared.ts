import 'server-only'
import { CLUB_LOCALE } from '@/config/site'
import { getClub } from '@/lib/club'
import { getPayloadClient } from '@/lib/payload/client'
import { formatMatchDay, formatMatchTime } from '@/lib/selection/lineup-text'
import { categoryOf } from '@/lib/stats/leaderboard'
import { getVisibleStatData } from '@/lib/stats/queries'
import { getStatsSettings } from '@/lib/site-settings'
import { isSocialEligible, juniorCategoryIds, type SocialPlayer } from '../eligibility'

/** A calendar date as `Sat 11 Oct` in the club's language. */
export const dayLabel = (isoDate: string | null | undefined): string => (isoDate ? formatMatchDay(isoDate, CLUB_LOCALE) : '')
export const timeLabel = (t: string | null | undefined): string => formatMatchTime(t)

export type SocialPlayerInfo = { id: number; slug: string; name: string; eligible: boolean; /** The player's `updatedAt`, kept in a queued post's snapshot. */ version: string }

/**
 * Every visible player with the one eligibility answer all the graphics use (wave C spec section 1). Hidden players are not in
 * the map. A player with no record at all is therefore ineligible, never shown (fail closed). `onDate` is the day the picture is for.
 */
export async function loadSocialPlayers(onDate: string): Promise<Map<number, SocialPlayerInfo>> {
  const payload = await getPayloadClient()
  const [res, stats, settings] = await Promise.all([
    payload.find({
      collection: 'players',
      where: { hidden: { equals: false } },
      pagination: false,
      depth: 0,
      overrideAccess: true,
      select: { displayName: true, firstName: true, lastName: true, slug: true, isJunior: true, socialOptIn: true, updatedAt: true },
    }),
    getVisibleStatData().catch(() => null),
    getStatsSettings(),
  ])
  // Without the stats we cannot tell which players are juniors by grade, so nobody is eligible (fail closed).
  if (!stats) return new Map()
  const junior = juniorCategoryIds(stats.rows, (r) => categoryOf(r, settings.gradeRules) === 'junior')
  const out = new Map<number, SocialPlayerInfo>()
  for (const p of res.docs) {
    const info: SocialPlayer = { isJunior: p.isJunior, socialOptIn: p.socialOptIn, juniorCategory: junior.has(p.id) }
    out.set(p.id, { id: p.id, slug: p.slug ?? '', name: p.displayName?.trim() || `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim(), eligible: isSocialEligible(info, onDate), version: p.updatedAt ?? '' })
  }
  return out
}

export { currentClubDate as clubToday } from '@/lib/selection/club-date'

export async function clubNames(): Promise<{ name: string; siteUrl: string }> {
  const club = await getClub()
  return { name: club.shortName || club.name, siteUrl: club.siteUrl }
}
