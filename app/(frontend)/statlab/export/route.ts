import { EXPORT_ROWS, rawFromSearchParams, statLabCsv, statLabHref } from '@/lib/stats/statlab'
import { runStatLab } from '@/lib/stats/statlab-queries'

// Public and recomputed per query string, so it is CDN cached (the key is the URL) and bounded
// by the column and row caps in the parser. Route handlers ignore `noindex` metadata, hence the header.
export const runtime = 'nodejs'

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const { params, result } = await runStatLab(rawFromSearchParams(url.searchParams))
  // One cache entry per report: redirect any non-canonical query (extras, reordering) to the canonical URL.
  const canonical = statLabHref('/statlab/export', params)
  if (`${url.pathname}${url.search}` !== canonical) {
    return new Response(null, { status: 308, headers: { Location: canonical, 'Cache-Control': 'public, s-maxage=600', 'X-Robots-Tag': 'noindex' } })
  }
  const { csv, truncated } = statLabCsv(params, result, EXPORT_ROWS)
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      // The scope is a whitelisted value; no user input reaches this header.
      'Content-Disposition': `attachment; filename="langlang-statlab-${params.scope}.csv"`,
      // Short: hiding a player is a privacy action and a route-handler response is not purged by revalidate*.
      'Cache-Control': 'public, s-maxage=60',
      'X-Robots-Tag': 'noindex',
      ...(truncated ? { 'X-Export-Truncated': '1' } : {}),
    },
  })
}
