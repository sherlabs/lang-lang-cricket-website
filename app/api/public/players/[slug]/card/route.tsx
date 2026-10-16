/* eslint-disable @next/next/no-img-element -- satori draws a plain <img>; next/image does not apply inside ImageResponse */
import { getClub } from '@/lib/club'
import { rankBadgesFor } from '@/lib/players/profile-extras'
import { getStatsSettings } from '@/lib/site-settings'
import { careerOf, mergeBySeason } from '@/lib/stats/aggregate'
import { themedImageResponse, WHITE, WHITE_75 } from '@/lib/theme/og'
import { CARD_SIZES, ROLE_LABEL, cardRole, cardStats, parseCardSeason, parseFormat } from '@/lib/stats/card'
import { filterRows } from '@/lib/stats/leaderboard'
import { getVisibleStatData } from '@/lib/stats/queries'
import { EMPTY_COUNTS } from '@/lib/players/season-math'
import { coverage, shortSeason, sinceLabel } from '@/lib/stats/season-window'

// satori (inside next/og) reads the bundled fonts and crest from disk (lib/theme/og.tsx); next.config.ts lists
// those files in outputFileTracingIncludes for this route.
export const runtime = 'nodejs'

// Short on purpose: a route-handler response is not purged by revalidatePath, so a player hidden by an
// admin must age out of the CDN quickly.
const OK_CACHE = 'public, s-maxage=300'
// A hidden or unknown player is cached briefly, so un-hiding recovers quickly.
const MISSING_CACHE = 'public, s-maxage=60'
const notFound = () =>
  new Response('Player not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': MISSING_CACHE, 'X-Robots-Tag': 'noindex' } })

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) return notFound()
  const url = new URL(req.url)
  const format = parseFormat(url.searchParams.get('format'))

  // Visible-only cached rows: a hidden player is simply not in `players`.
  const [club, settings, data] = await Promise.all([getClub(), getStatsSettings(), getVisibleStatData()])
  const player = [...data.players.values()].find((p) => p.slug === slug)
  if (!player) return notFound()

  const season = parseCardSeason(url.searchParams.get('season'), data.seasons.map((s) => s.seasonName))
  // One cache entry per card: redirect any non-canonical query (extras, reordering) to the canonical URL.
  const query = new URLSearchParams()
  if (format !== 'og') query.set('format', format)
  if (season) query.set('season', season)
  const canonical = `${url.pathname}${query.size ? `?${query}` : ''}`
  if (`${url.pathname}${url.search}` !== canonical) {
    return new Response(null, { status: 308, headers: { Location: canonical, 'Cache-Control': 'public, s-maxage=300', 'X-Robots-Tag': 'noindex' } })
  }
  const scoped = filterRows(data.rows, { cats: settings.defaultIncludedCategories, rules: settings.gradeRules }).filter((r) => r.playerId === player.id)
  const rows = season ? scoped.filter((r) => r.seasonName === season) : scoped
  const counts = (season ? mergeBySeason(rows)[0]?.counts : careerOf(rows)[0]?.counts) ?? EMPTY_COUNTS
  const role = cardRole(counts)
  const stats = cardStats(counts, role, season ? settings.qualification.season : settings.qualification.career)
  const best = season ? null : rankBadgesFor(player.id, data.rows, settings).sort((a, b) => a.rank - b.rank)[0] ?? null
  const names = [...new Set(rows.map((r) => r.seasonName))]
  const span = season ? shortSeason(season) : (() => { const w = coverage(rows); return w ? (w.from === w.to ? shortSeason(w.from) : `${shortSeason(w.from)} to ${shortSeason(w.to)}`) : '' })()
  const scopeText = season ? shortSeason(season) : sinceLabel(data.rows)
  const { width, height } = CARD_SIZES[format]
  const square = format === 'square'

  return themedImageResponse(
    ({ theme, crestDataUri: crest }) => {
      const c = theme.colors
      return (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontFamily: 'Body', background: c.black, color: WHITE, padding: square ? 72 : 56, borderTop: `14px solid ${c.gold}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {crest && (
              // The crest is dark: a cream tile keeps it legible on the black card.
              <div style={{ display: 'flex', background: c.cream, padding: 10, borderRadius: 14, marginRight: 24 }}>
                <img src={crest} height={square ? 96 : 72} style={{ height: square ? 96 : 72 }} alt="" />
              </div>
            )}
            <div style={{ display: 'flex', fontSize: square ? 34 : 28, letterSpacing: 4, textTransform: 'uppercase', color: c['gold-light'] }}>{club.name}</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: square ? 110 : 84, lineHeight: 1.05, fontFamily: 'Display', color: WHITE }}>{player.name}</div>
          <div style={{ display: 'flex', marginTop: 14, fontSize: square ? 36 : 30, color: c.gold }}>
            {[ROLE_LABEL[role], span].filter(Boolean).join('  |  ')}
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          {stats.map((s) => (
            <div key={s.label} style={{ display: 'flex', flexDirection: 'column', width: square ? '46%' : '23%', marginBottom: square ? 36 : 0 }}>
              <div style={{ display: 'flex', fontSize: square ? 110 : 80, lineHeight: 1, fontFamily: 'Display', color: c['gold-light'] }}>{s.value}</div>
              <div style={{ display: 'flex', marginTop: 8, fontSize: square ? 32 : 26, textTransform: 'uppercase', letterSpacing: 2, color: WHITE_75 }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: square ? 30 : 24, color: WHITE_75 }}>
          <div style={{ display: 'flex' }}>
            {best ? (
              <div style={{ display: 'flex', background: c['gold-pale'], color: c['gold-deep'], padding: '8px 22px', borderRadius: 999 }}>
                {`${best.rank === 1 ? '1st' : best.rank === 2 ? '2nd' : '3rd'} for ${best.label.toLowerCase()}, ${scopeText}`}
              </div>
            ) : (
              <div style={{ display: 'flex' }}>{names.length ? `Stats ${scopeText}` : 'No stats recorded yet'}</div>
            )}
          </div>
          <div style={{ display: 'flex' }}>{club.siteUrl.replace(/^https?:\/\//, '')}</div>
        </div>
      </div>
      )
    },
    { width, height, headers: { 'Cache-Control': OK_CACHE, 'X-Robots-Tag': 'noindex' } },
  )
}
