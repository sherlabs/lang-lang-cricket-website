import { NextResponse, type NextRequest } from 'next/server'
import { anonymousAdminRedirect } from '@/lib/admin/edge-gate'

/** Gives signed-out visitors a real 307 on admin pages before the loading shell streams (see lib/admin/edge-gate.ts). */
export async function proxy(request: NextRequest) {
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
