import type { PayloadRequest } from 'payload'

export const fail = (status: number, message: string) => Response.json({ errors: [{ message }] }, { status })

/** Null when the caller is a signed-in admin; otherwise the 401/403 response to return. Editors are refused: these tools are for the site administrator. */
export function refuseNonAdmin(req: PayloadRequest): Response | null {
  if (!req.user) return fail(401, 'You must be logged in.')
  if ((req.user as { role?: string }).role !== 'admin') return fail(403, 'Only the site administrator can do this.')
  return null
}

export async function readJson(req: PayloadRequest): Promise<Record<string, unknown>> {
  try {
    return ((await req.json?.()) ?? {}) as Record<string, unknown>
  } catch {
    return {}
  }
}
