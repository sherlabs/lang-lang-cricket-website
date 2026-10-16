import { getClub } from '@/lib/club'
import { LINEUP_IMAGE_SIZE, renderLineup } from '@/lib/selection/lineup-image'
import { getSelectionUser } from '@/lib/selector-auth'
import { previewTeam } from '@/lib/selector-team-queries'
import { themedImageResponse } from '@/lib/theme/og'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = 'private, no-store'
const notFound = () => new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': NO_STORE, 'X-Robots-Tag': 'noindex' } })

/** The working (draft) team as the graphic, for the selector only. Signed-out and unknown games get the same plain 404. */
export async function GET(req: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const selector = await getSelectionUser(req.headers)
  if (!selector) return notFound()
  const { gameId } = await params
  const team = await previewTeam(selector, gameId)
  if (!team) return notFound()
  const club = await getClub()
  return themedImageResponse((ctx) => renderLineup(team, ctx, { clubName: club.shortName || club.name, locale: club.locale, siteHost: club.siteUrl.replace(/^https?:\/\//, '') }), {
    ...LINEUP_IMAGE_SIZE,
    headers: { 'Cache-Control': NO_STORE, 'X-Robots-Tag': 'noindex' },
  })
}
