import config from '@payload-config'
import { getPayload, handleEndpoints, type CollectionSlug, type Payload } from 'payload'
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

export async function clearCollection(payload: Payload, collection: CollectionSlug): Promise<void> {
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

/** A logged-in user's JWT, creating the user first when needed (context.seedAdmin passes the first-register guard). */
export async function tokenFor(payload: Payload, role: 'admin' | 'editor', email = `${role}@example.com`): Promise<string> {
  const password = `${role}-pass-123`
  const found = await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, depth: 0 })
  if (!found.docs.length) {
    await payload.create({ collection: 'users', data: { email, password, role }, context: { seedAdmin: true, disableRevalidate: true } })
  }
  const res = await payload.login({ collection: 'users', data: { email, password } })
  return res.token!
}

/** Resets a global to "never saved" (no row), so defaults apply again. */
export async function resetGlobal(payload: Payload, slug: 'club' | 'site-settings'): Promise<void> {
  const { sql } = await import('@payloadcms/db-postgres/drizzle')
  await payload.db.drizzle.execute(sql.raw(`DELETE FROM "payload"."${slug.replace(/-/g, '_')}"`))
}
