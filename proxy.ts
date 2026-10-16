import { NextResponse, type NextRequest } from 'next/server'
import { anonymousAdminRedirect, crossSiteReentryPage } from '@/lib/admin/edge-gate'

/**
 * Gives signed-out visitors a real 307 on admin pages before the loading shell streams, and reopens a signed-in person's link from
 * another site from this origin so Payload accepts their cookie (see lib/admin/edge-gate.ts).
 */
export async function proxy(request: NextRequest) {
  const reentry = await crossSiteReentryPage({
    method: request.method,
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    cookieHeader: request.headers.get('cookie'),
    secret: process.env.PAYLOAD_SECRET,
    secFetchSite: request.headers.get('sec-fetch-site'),
    secFetchMode: request.headers.get('sec-fetch-mode'),
  })
  if (reentry !== null) {
    return new NextResponse(reentry, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } })
  }
  const target = await anonymousAdminRedirect({
    method: request.method,
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    cookieHeader: request.headers.get('cookie'),
    secret: process.env.PAYLOAD_SECRET,
  })
  return target === null ? NextResponse.next() : NextResponse.redirect(new URL(target, request.url), 307)
}

export const config = { matcher: ['/admin', '/admin/:path*'] }
