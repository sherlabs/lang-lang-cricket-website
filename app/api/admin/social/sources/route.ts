import { GRAPHICS } from '@/lib/social/registry'
import { notFound, PRIVATE_HEADERS, staffUser } from '@/lib/social/staff'
import { isGraphicType } from '@/lib/social/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET (committee only): the choices for a graphic type (ids and labels only, no statistics). `game` narrows the player of the match list. */
export async function GET(request: Request): Promise<Response> {
  if (!(await staffUser(request))) return notFound()
  const url = new URL(request.url)
  const type = url.searchParams.get('type')
  if (!isGraphicType(type)) return notFound()
  const game = url.searchParams.get('game') ?? undefined
  const list = await GRAPHICS[type].choices({ game })
  return Response.json({ type, ...list }, { headers: PRIVATE_HEADERS })
}
