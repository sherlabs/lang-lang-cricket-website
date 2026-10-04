import type { PayloadRequest } from 'payload'

export const fail = (status: number, message: string) => Response.json({ errors: [{ message }] }, { status })

/** Largest request body an admin tool endpoint accepts: the 2 MB CSV plus the JSON wrapper and escaping. */
export const MAX_BODY_BYTES = 3 * 1024 * 1024

/** Null when the caller is a signed-in admin; otherwise the 401/403 response to return. Editors are refused: these tools are for the site administrator. */
export function refuseNonAdmin(req: PayloadRequest): Response | null {
  if (!req.user) return fail(401, 'You must be logged in.')
  if ((req.user as { role?: string }).role !== 'admin') return fail(403, 'Only the site administrator can do this.')
  // Refused on the declared length, before `req.json()` buffers anything. The CSV parser still enforces its own 2 MB.
  if (Number(req.headers?.get?.('content-length') ?? 0) > MAX_BODY_BYTES) return fail(413, 'That request is too large (the limit for a file is 2 MB).')
  return null
}

export async function readJson(req: PayloadRequest): Promise<Record<string, unknown>> {
  try {
    return ((await req.json?.()) ?? {}) as Record<string, unknown>
  } catch {
    return {}
  }
}
