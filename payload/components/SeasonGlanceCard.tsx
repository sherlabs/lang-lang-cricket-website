// @committee-facing
import { CLUB_TIMEZONE } from '@/config/site'
import { formatClubDate, formatClubDay } from '@/lib/admin/club-day'
import { RECORD_RULE } from '@/lib/admin/season-glance'
import { getClub } from '@/lib/club'
import Link from 'next/link'
import type { Payload } from 'payload'
import { Card, Section } from './ui/Card'
import { loadSeasonGlance } from './seasonGlanceData'

/**
 * "Season at a glance": the leading senior team's record, next game, last result and (when a fresh ladder for the same grade exists)
 * ladder position, from stored data only. Left out entirely when the data is old or missing.
 */
export async function SeasonGlanceCard({ payload }: { payload: Payload }) {
  const [glance, club] = await Promise.all([loadSeasonGlance(payload), getClub()])
  if (!glance) return null
  const clock = { timeZone: CLUB_TIMEZONE, locale: club.locale }
  const g = glance
  return (
    <Section title="Season at a glance" id="season" className="club-home__season">
      <Card tone="plain" className="club-glance">
        <p className="club-glance__who">
          <strong>{g.team}</strong>
          <span>{g.grade}</span>
        </p>
        <dl className="club-glance__grid">
          <div title={RECORD_RULE}>
            <dt>Record</dt>
            <dd><Link href="/matches" prefetch={false}>Played {g.played}, won {g.won}, lost {g.lost}</Link></dd>
          </div>
          {g.ladder ? (
            <div>
              <dt>Ladder</dt>
              <dd><Link href="/fixtures" prefetch={false}>{ordinal(g.ladder.position)} of {g.ladder.of}</Link></dd>
            </div>
          ) : null}
          {g.nextGame ? (
            <div>
              <dt>Next game</dt>
              <dd><Link href="/fixtures" prefetch={false}>{formatClubDay(g.nextGame.date, clock)}{g.nextGame.time ? `, ${g.nextGame.time}` : ''} {g.nextGame.home ? 'v' : 'at'} {g.nextGame.opponent}</Link></dd>
            </div>
          ) : null}
          {g.lastResult ? (
            <div>
              <dt>Last result</dt>
              <dd><Link href="/matches" prefetch={false}>{g.lastResult.word} v {g.lastResult.opponent}{g.lastResult.date ? `, ${formatClubDay(g.lastResult.date, clock)}` : ''}</Link></dd>
            </div>
          ) : null}
        </dl>
        <p className="club-glance__asof">As of {formatClubDate(g.asOf, clock)}, the last update from PlayHQ.</p>
      </Card>
    </Section>
  )
}

const ordinal = (n: number): string => {
  const v = n % 100
  const suffix = ['th', 'st', 'nd', 'rd'][(v - 20) % 10] ?? ['th', 'st', 'nd', 'rd'][v] ?? 'th'
  return `${n}${suffix}`
}
