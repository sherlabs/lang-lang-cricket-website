import 'server-only'
import { getPayloadClient } from '@/lib/payload/client'

/** 303 back to an office page with a short flash code (see `flash.ts`). The location is relative, so it never leaves this site. */
export async function backToOffice(path: string, params: Record<string, string | number>): Promise<Response> {
  const payload = await getPayloadClient()
  const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))
  return new Response(null, { status: 303, headers: { Location: `${payload.config.routes.admin}${path}${q.size ? `?${q}` : ''}`, 'Cache-Control': 'no-store' } })
}
