import { JsonLd } from '@/components/json-ld'
import { playerJsonLd } from '@/lib/structured-data'
import Link from 'next/link'
import { cache } from 'react'
import { notFound } from 'next/navigation'
import { getPlayerProfile as loadPlayerProfile } from '@/lib/players/queries'
import { baseOpenGraph, canonicalFor, titleWithSuffix } from "@/lib/site-metadata"
import { getClub } from '@/lib/club'
import { getClubWithCrest } from '@/lib/theme'
import { battingView, bowlingView } from '@/lib/players/view'
import { Avatar } from '@/components/avatar'
import { SponsoredBy } from '@/components/players/player-sponsors'
import { listSponsorsOfPlayer } from '@/lib/player-sponsors-queries'
import { PlayerSeasonTables } from '@/components/players/player-season-tables'
import { ProgressionChart } from '@/components/stats/progression-chart'
import { RankBadge } from '@/components/stats/rank-badge'
import { ShareButton } from '@/components/stats/share-button'
import { buildProfileExtras, splitJuniorSeasons } from '@/lib/players/profile-extras'
import { careerTotals } from '@/lib/players/view'
import { getStatsSettings as loadStatsSettings } from '@/lib/site-settings'
import { getVisibleStatData } from '@/lib/stats/queries'
import { MatchAnalysis } from '@/components/stats/match/match-analysis'
import { getPlayerMatchFacts } from '@/lib/match-store/stats-queries'
import { buildLabelMap, canonicalGrade } from '@/lib/stats/labels'
import { buildProfileMatchView } from '@/lib/stats/match/profile'
import { describeAchieved, topAchieved } from '@/lib/stats/milestones'
import { coverage, shortSeason, sinceLabel } from '@/lib/stats/season-window'

export const dynamic = 'force-dynamic'

// generateMetadata and the page both need these: de-duplicate within one request.
const getPlayerProfile = cache(loadPlayerProfile)
const getStatsSettings = cache(loadStatsSettings)

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const pill = 'inline-flex items-center gap-2 rounded-full bg-brand-gold-pale px-3 py-1.5 text-sm font-semibold text-brand-gold-deep ring-1 ring-brand-gold/30'

export async function generateMetadata(props: Props) {
  const params = await props.params;
  const club = await getClub()
  const profile = await getPlayerProfile(params.slug, club.teamNamePrefix)
  if (!profile) return { title: titleWithSuffix(club, 'Player') }
  // The stat card counts non-junior rows only, so a junior-only player has nothing to show on it.
  const hasCardStats = splitJuniorSeasons(profile.seasons, (await getStatsSettings()).gradeRules, false).seasons.length > 0
  const filtered = (await props.searchParams).juniors !== undefined
  const summary = [profile.active ? 'Active player' : 'Past player', profile.yearsLabel, profile.grades.join(' · ')]
    .filter(Boolean)
    .join(' — ')
  return {
    // The junior view is a near-duplicate of the page: noindex, and a noindex page carries no canonical.
    ...(filtered ? { robots: { index: false, follow: true } } : { alternates: canonicalFor(`/players/${profile.player.slug}`) }),
    title: titleWithSuffix(club, profile.name),
    description: `${summary}. Career stats and club honours at ${club.name}.`,
    // Share previews show the player's own photo when the club has added one, else their stat card.
    openGraph: profile.player.photoUrl
      ? { ...baseOpenGraph(club), images: [{ url: profile.player.photoUrl, alt: profile.name }] }
      : !hasCardStats
        ? baseOpenGraph(club)
        : {
          ...baseOpenGraph(club),
          images: [{ url: `/api/public/players/${profile.player.slug}/card`, width: 1200, height: 630, alt: `${profile.name}: ${club.name} stat card` }],
        },
  }
}

export default async function PlayerPage(props: Props) {
  const params = await props.params;
  const includeJuniors = (await props.searchParams).juniors === '1'
  const [club, settings, data] = await Promise.all([getClubWithCrest(), getStatsSettings(), getVisibleStatData()])
  const profile = await getPlayerProfile(params.slug, club.teamNamePrefix)
  if (!profile) notFound()
  const { player } = profile
  const sponsors = await listSponsorsOfPlayer(player.id)
  // Junior rows are left off unless asked for; every figure below follows the seasons shown.
  // A player with only junior seasons would otherwise see an empty page, so their juniors are always shown.
  const seniorOnly = splitJuniorSeasons(profile.seasons, settings.gradeRules, false)
  const juniorOnly = seniorOnly.hasJuniorRows && seniorOnly.seasons.length === 0
  const split = splitJuniorSeasons(profile.seasons, settings.gradeRules, includeJuniors || juniorOnly)
  const shownSeasons = split.seasons
  const career = shownSeasons.length ? careerTotals(shownSeasons) : null
  const extras = buildProfileExtras({
    playerId: player.id, seasons: shownSeasons, career, leagueRows: data.rows, settings, manualYears: player.manualYears, baseline: profile.baseline,
  })
  // Match analysis reads only tag-cached season blobs; if it cannot be built the profile still renders.
  const matchView = await getPlayerMatchFacts(player.id)
    .then((mf) => {
      if (!mf) return null
      const labels = buildLabelMap([...mf.player.matches.values()].map((h) => ({ kind: 'grade' as const, label: h.grade })))
      return buildProfileMatchView({
        player: mf.player, partnerships: mf.player.partnerships, playerId: player.id, names: data.players, minimums: settings.matchMinimums,
        gradeLabel: (g) => (g ? canonicalGrade(g, labels) : null),
      })
    })
    .catch((err) => {
      console.warn('[players] match analysis unavailable:', (err as Error).message)
      return null
    })
  const windowStart = coverage(data.rows)?.from ?? null
  const windowLabel = windowStart ? shortSeason(windowStart) : null
  const since = sinceLabel(data.rows)
  const milestoneBadges = topAchieved(extras.milestones.achieved)
  const hasBadges = milestoneBadges.length > 0 || extras.ranks.length > 0 || extras.centurion || extras.fiveWicketHaul
  const bw = extras.bestWorst
  const summary: { label: string; best: string; worst: string }[] = [
    ['runs', 'Runs'], ['avg', 'Batting average'], ['wickets', 'Wickets'],
  ].flatMap(([key, label]) => {
    const x = bw[key]
    if (!x) return []
    const season = (names: string[]) => names.map(shortSeason).join(', ')
    return [{ label, best: `${x.bestText} in ${season(x.best)}`, worst: `${x.worstText} in ${season(x.worst)}` }]
  })
  const bat = career ? battingView(career) : null
  const bowl = career ? bowlingView(career) : null
  const tiles: (readonly [string, string | number])[] =
    career && bat && bowl
      ? [
          ['Games', career.games],
          ['Runs', bat.runs],
          ['High score', bat.highScore],
          ['Bat avg', bat.average],
          ['Wickets', bowl.wickets],
          ['Best', bowl.best],
          ['Catches', career.catches],
        ]
      : []
  const paragraphs = player.bio
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)

  return (
    <main>
      <JsonLd data={playerJsonLd({ slug: player.slug, name: profile.name, photoUrl: player.photoUrl }, club)} />
      <section className="relative overflow-hidden bg-brand-black text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-gold/15 blur-3xl"
        />
        <div className="container-site relative flex flex-col gap-8 py-12 sm:flex-row sm:items-end lg:py-16">
          <div className="h-40 w-40 shrink-0 overflow-hidden rounded-3xl bg-white/10 ring-1 ring-white/10 sm:h-48 sm:w-48">
            <Avatar name={profile.name} photoUrl={player.photoUrl} alt={profile.name} initialsClassName="text-6xl text-white/40" />
          </div>
          <div className="min-w-0">
            <Link href="/players" className="text-sm text-white/60 hover:text-white">
              ← All players
            </Link>
            <p className="eyebrow mt-4 text-brand-gold">{profile.active ? 'Active player' : 'Past player'}</p>
            <h1 className="display mt-2 break-words text-4xl sm:text-5xl">{profile.name}</h1>
            {profile.clubRole && (
              <p className="mt-3 text-sm font-semibold text-brand-gold-light">
                <Link href="/people" className="underline decoration-brand-gold decoration-2 underline-offset-4">Club {profile.clubRole}</Link>
              </p>
            )}
            {profile.yearsLabel && <p className="mt-3 text-white/75">{profile.yearsLabel}</p>}
            {profile.grades.length > 0 && <p className="mt-1 text-sm text-white/60">{profile.grades.join(' · ')}</p>}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <ShareButton path={`/players/${player.slug}`} title={`${profile.name} at ${club.name}`} label="Share" />
              <a
                href={`/api/public/players/${player.slug}/card`}
                download={`${player.slug}-stat-card.png`}
                className="inline-flex min-h-11 items-center rounded-full bg-white/10 px-4 text-sm font-semibold text-white ring-1 ring-white/25 transition hover:bg-white/15"
              >
                Stat card
                <span className="sr-only"> (image to save or share)</span>
              </a>
              {career && !juniorOnly && (
                <Link
                  href={`/players/compare?a=${player.slug}`}
                  className="inline-flex min-h-11 items-center rounded-full bg-brand-gold px-4 text-sm font-semibold text-brand-black transition hover:bg-brand-gold-light"
                >
                  Compare with another player
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="container-site space-y-14 py-12 lg:py-16">
        {tiles.length > 0 && (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {tiles.map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-brand-black/5">
                <dt className="text-xs font-semibold uppercase tracking-wide text-brand-grey">{label}</dt>
                <dd className="display mt-1 text-3xl tabular-nums text-brand-black">{value}</dd>
              </div>
            ))}
          </dl>
        )}

        <SponsoredBy tiles={sponsors} />

        {hasBadges && (
          <section aria-labelledby="badges-heading">
            <h2 id="badges-heading" className="display mb-4 text-2xl text-brand-black">Milestones &amp; standings</h2>
            <ul className="flex flex-wrap gap-2">
              {extras.ranks.map((r) => (
                <li key={r.key} className={pill}>
                  <RankBadge rank={r.rank} badge={r.badge} />
                  <span>{r.label}: {r.display} ({since})</span>
                </li>
              ))}
              {milestoneBadges.map((a) => (
                <li key={a.key} className={pill}>{describeAchieved(a, windowLabel)}</li>
              ))}
              {extras.centurion && <li className={pill}>Centurion: has scored 100 or more in an innings ({since})</li>}
              {extras.fiveWicketHaul && <li className={pill}>Five-wicket haul: has taken 5 or more wickets in an innings ({since})</li>}
            </ul>
            {extras.milestones.partial && (
              <p className="mt-3 text-sm text-brand-grey">Totals count seasons {since} only; this player&rsquo;s earlier years are not in the database.</p>
            )}
            {extras.ranks.length > 0 && <p className="mt-3 text-sm text-brand-grey">Standings are top-three places on the <Link href="/stats" className="font-semibold text-brand-gold-deep underline underline-offset-2">stats leaderboards</Link> (qualifying minimums apply).</p>}
          </section>
        )}

        {(paragraphs.length > 0 || profile.honours.length > 0) && (
          <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
            {paragraphs.length > 0 && (
              <div>
                <h2 className="display mb-4 text-2xl text-brand-black">About</h2>
                <div className="space-y-4 leading-relaxed text-brand-charcoal">
                  {paragraphs.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              </div>
            )}
            {profile.honours.length > 0 && (
              <div>
                <h2 className="display mb-4 text-2xl text-brand-black">Honours &amp; roles</h2>
                <ul className="divide-y divide-brand-black/5 rounded-2xl bg-brand-gold-pale ring-1 ring-brand-gold/30">
                  {profile.honours.map((h) => (
                    <li key={h.id} className="flex gap-4 px-5 py-3">
                      <span className="w-24 shrink-0 font-semibold tabular-nums text-brand-gold-deep">{h.years}</span>
                      <span className="min-w-0 text-brand-black">{h.title}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {extras.series.length > 0 && (
          <section aria-labelledby="progression-heading">
            <h2 id="progression-heading" className="display mb-6 text-2xl text-brand-black">Season progression</h2>
            <div className="grid gap-6 md:grid-cols-2">
              {extras.series.map((series) => (
                <ProgressionChart key={series.key} series={series} idPrefix={`prog-${series.key}`} />
              ))}
            </div>
          </section>
        )}

        {matchView && <MatchAnalysis view={matchView} minimums={settings.matchMinimums} />}

        {career && (
          <div>
            <h2 className="display mb-3 text-2xl text-brand-black">Season by season</h2>
            {summary.length > 0 && (
              <dl className="mb-4 grid gap-3 sm:grid-cols-3">
                {summary.map((x) => (
                  <div key={x.label} className="rounded-2xl bg-white p-4 text-sm shadow-card ring-1 ring-brand-black/5">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-brand-grey">{x.label}</dt>
                    <dd className="mt-1 text-brand-charcoal"><span aria-hidden>★ </span><span className="font-semibold">Best:</span> {x.best}</dd>
                    <dd className="text-brand-charcoal"><span aria-hidden>▽ </span><span className="font-semibold">Lowest:</span> {x.worst}</dd>
                  </div>
                ))}
              </dl>
            )}
            {Object.keys(bw).length > 0 && (
              <p className="mb-4 text-sm text-brand-grey">★ marks a best season and ▽ a lowest one in the tables. Averages and rates only compare seasons that meet the season minimums.</p>
            )}
            <PlayerSeasonTables seasons={shownSeasons} career={career} teamNamePrefix={club.teamNamePrefix} bestWorst={bw} />
          </div>
        )}

        {split.hasJuniorRows && (
          <p className="text-sm text-brand-grey">
            {juniorOnly
              ? 'All of this player\u2019s recorded seasons are junior seasons.'
              : <>
                  {includeJuniors ? 'Junior seasons are included.' : 'Junior seasons are hidden.'}{' '}
                  <Link href={includeJuniors ? `/players/${player.slug}` : `/players/${player.slug}?juniors=1`} className="font-semibold text-brand-gold-deep underline underline-offset-2">
                    {includeJuniors ? 'Hide junior seasons' : 'Show junior seasons'}
                  </Link>
                </>}
          </p>
        )}
      </div>
    </main>
  )
}
