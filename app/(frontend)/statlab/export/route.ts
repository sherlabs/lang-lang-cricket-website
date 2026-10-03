import { EXPORT_ROWS, rawFromSearchParams, statLabCsv } from '@/lib/stats/statlab'
import { runStatLab } from '@/lib/stats/statlab-queries'

// Public and recomputed per query string, so it is CDN cached (the key is the URL) and bounded
// by the column and row caps in the parser. Route handlers ignore `noindex` metadata, hence the header.
export const runtime = 'nodejs'

export async function GET(request: Request): Promise<Response> {
  const { params, result } = await runStatLab(rawFromSearchParams(new URL(request.url).searchParams))
  const { csv, truncated } = statLabCsv(params, result, EXPORT_ROWS)
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      // The scope is a whitelisted value; no user input reaches this header.
      'Content-Disposition': `attachment; filename="langlang-statlab-${params.scope}.csv"`,
      'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=60',
      'X-Robots-Tag': 'noindex',
      ...(truncated ? { 'X-Export-Truncated': '1' } : {}),
    },
  })
}
