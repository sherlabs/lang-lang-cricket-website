import config from '@payload-config'
import { getPayload, handleEndpoints, type Payload } from 'payload'
import { assertTestDb } from './env'

export async function getTestPayload(): Promise<Payload> {
  assertTestDb(process.env.DATABASE_URI)
  return getPayload({ config })
}

/** Calls the REST handler exactly as the Next route does (anonymous unless a token is given). */
export async function rest(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  opts: { body?: unknown; token?: string } = {},
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- REST bodies are asserted ad hoc in tests
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = {}
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  if (opts.token) headers.Authorization = `JWT ${opts.token}`
  const request = new Request(`http://localhost:3000/api${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
  const res = await handleEndpoints({ config, request })
  const text = await res.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = text
  }
  return { status: res.status, json }
}

export async function clearCollection(payload: Payload, collection: 'users' | 'media'): Promise<void> {
  await payload.delete({ collection, where: { id: { exists: true } }, overrideAccess: true, context: { disableRevalidate: true } })
}

/**
 * Files share one fork (singleFork) and Payload caches its instance on
 * `global._payload`, so a destroyed instance would be handed to the next file.
 */
export async function destroyTestPayload(payload: Payload | undefined): Promise<void> {
  await payload?.destroy()
  ;(globalThis as { _payload?: Map<string, unknown> })._payload?.clear()
}
