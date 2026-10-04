import { isCanonicalRequest, rawFromSearchParams, statLabHref } from '@/lib/stats/statlab'
import { runStatLab } from '@/lib/stats/statlab-queries'

// Plain-text sidecar of the CSV export (W2 spec 5.4): the same coverage caption the page shows, so it
// can travel with the file without putting `#` comment rows inside it. Same query, same canonical URL.
export const runtime = 'nodejs'

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const { params, caption } = await runStatLab(rawFromSearchParams(url.searchParams))
  const canonical = statLabHref('/statlab/export/caption', params)
  if (!isCanonicalRequest(url, canonical)) {
    return new Response(null, { status: 308, headers: { Location: canonical, 'Cache-Control': 'public, s-maxage=600', 'X-Robots-Tag': 'noindex' } })
  }
  return new Response(`${caption}.\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, s-maxage=60', 'X-Robots-Tag': 'noindex' },
  })
}
