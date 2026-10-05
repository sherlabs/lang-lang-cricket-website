import { getClub } from '@/lib/club'
import { EXPORT_FILENAME_PREFIX } from '@/config/site'
import { LINEUP_IMAGE_SIZE, renderLineup } from '@/lib/selection/lineup-image'
import { getPublishedTeam } from '@/lib/teams-queries'
import { themedImageResponse } from '@/lib/theme/og'

// satori reads the bundled fonts and crest from disk (lib/theme/og.tsx); next.config.ts lists them for this route.
export const runtime = 'nodejs'

// Explicit and short: a route-handler response is not purged by revalidatePath, so a withdrawn team ages out of the CDN within minutes.
const OK_CACHE = 'public, s-maxage=300, stale-while-revalidate=600'
const MISSING_CACHE = 'public, s-maxage=60'

/** One identical answer for a draft, an unpublished edit, a withdrawn team, a removed game and an unknown id. */
const notFound = () => new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': MISSING_CACHE, 'X-Robots-Tag': 'noindex' } })

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

export async function GET(req: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params
  const team = await getPublishedTeam(gameId)
  if (!team) return notFound()
  const club = await getClub()
  const download = new URL(req.url).searchParams.get('download') === '1'
  const filename = [EXPORT_FILENAME_PREFIX, slug(team.gradeName), team.localDate].filter(Boolean).join('-')
  return themedImageResponse((ctx) => renderLineup(team, ctx, { clubName: club.shortName || club.name, locale: club.locale, siteHost: club.siteUrl.replace(/^https?:\/\//, '') }), {
    ...LINEUP_IMAGE_SIZE,
    headers: { 'Cache-Control': OK_CACHE, 'X-Robots-Tag': 'noindex', ...(download ? { 'Content-Disposition': `attachment; filename="${filename}.png"` } : {}) },
  })
}
