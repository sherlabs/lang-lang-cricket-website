import { captionFor, loadGraphic } from '@/lib/social/pipeline'
import { notFound, parseCommon, PRIVATE_HEADERS, staffUser } from '@/lib/social/staff'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET (committee only): the caption (the club's template filled from the data), plain text, and a one-line description for alt text. */
export async function GET(request: Request): Promise<Response> {
  if (!(await staffUser(request))) return notFound()
  const common = parseCommon(new URL(request.url))
  if (!common) return notFound()
  const loaded = await loadGraphic(common.type, common.raw)
  if (!loaded) return notFound()
  return Response.json(await captionFor(loaded), { headers: PRIVATE_HEADERS })
}
