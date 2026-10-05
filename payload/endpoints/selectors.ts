import { randomBytes } from 'node:crypto'
import type { Endpoint, PayloadRequest } from 'payload'
import { selectorPaths } from '../../config/site'
import { hashInviteToken, inviteWindow, newInviteToken } from '../../lib/selector-invite'
import { MIN_PASSWORD_LENGTH } from '../../lib/selector-status'
import { isSignedIn, isStaffUser } from '../access'
import { fail, MAX_BODY_BYTES, readJson } from './adminOnly'

/**
 * The committee's selector tools (spec 3.4): `POST /api/selectors/create|invite|unlink|disable|enable|set-password|remove`.
 * Each is for admin or editor only and calls the Local API with `overrideAccess: false` as the signed-in person, so the collection
 * rules in `payload/collections/Users.ts` are the one source of truth for what an editor may do to which row.
 */

/** Null when the caller is a signed-in admin or editor; otherwise the 401/403 to return. */
export function refuseNonStaff(req: PayloadRequest): Response | null {
  if (!isSignedIn(req.user)) return fail(401, 'You must be logged in.')
  if (!isStaffUser(req.user)) return fail(403, 'Only the committee can manage selectors.')
  if (Number(req.headers?.get?.('content-length') ?? 0) > MAX_BODY_BYTES) return fail(413, 'That request is too large.')
  return null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const toId = (v: unknown): number | null => {
  const id = Number(v)
  return Number.isInteger(id) && id > 0 ? id : null
}
const messageOf = (err: unknown, fallback: string): string => {
  const e = err as { message?: string; data?: { errors?: Array<{ message?: string }> } }
  return e?.data?.errors?.[0]?.message ?? (e?.message && !/^Something went wrong/.test(e.message) ? e.message : fallback)
}

/** The invite link is shown once, to the person who made it, so it carries the absolute origin. */
const inviteUrl = (req: PayloadRequest, token: string): string => `${req.payload.config.serverURL}${selectorPaths.invite(token)}`

type Row = { id: number; role?: string | null }

/** The selector a request names, read with the caller's own access; anything else (an editor, a missing id) is a plain 404. */
async function loadSelector(req: PayloadRequest, id: number): Promise<Row | null> {
  try {
    const row = (await req.payload.findByID({ collection: 'users', id, depth: 0, user: req.user, overrideAccess: false, select: { role: true } })) as Row
    return row.role === 'selector' ? row : null
  } catch {
    return null
  }
}

type Handler = (req: PayloadRequest, body: Record<string, unknown>) => Promise<Response>

const guarded =
  (handler: Handler): Endpoint['handler'] =>
  async (req) => {
    const refused = refuseNonStaff(req)
    if (refused) return refused
    try {
      return await handler(req, await readJson(req))
    } catch (err) {
      return fail(400, messageOf(err, 'That did not work. Please try again.'))
    }
  }

const withTarget =
  (run: (req: PayloadRequest, row: Row, body: Record<string, unknown>) => Promise<Response>): Handler =>
  async (req, body) => {
    const id = toId(body.id)
    const row = id ? await loadSelector(req, id) : null
    if (!row) return fail(404, 'That selector was not found.')
    return run(req, row, body)
  }

const ctx = { disableRevalidate: true }

const create: Handler = async (req, body) => {
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!name || name.length > 80) return fail(400, 'Enter their name.')
  if (!EMAIL_RE.test(email) || email.length > 200) return fail(400, 'Enter an email address, for example sam@example.com.')
  const token = newInviteToken()
  const w = inviteWindow()
  // Counted across every role (a selector must not share an address with an admin), but the message is generic so an editor
  // cannot tell whether an admin's or editor's address exists.
  const clash = await req.payload.count({ collection: 'users', where: { email: { equals: email } }, overrideAccess: true })
  if (clash.totalDocs) return fail(400, 'That email address cannot be used for a new selector login.')
  const doc = await req.payload.create({
    collection: 'users',
    // Payload needs a password; this one is random and nobody ever knows it. The person chooses theirs from the invite link.
    data: { email, name, role: 'selector', password: randomBytes(32).toString('base64url') },
    user: req.user,
    overrideAccess: false,
    context: { ...ctx, randomPassword: true, selectorInvite: { hash: hashInviteToken(token), expiresAt: w.expiresAt, invitedAt: w.invitedAt } },
  })
  return Response.json({ ok: true, id: doc.id, inviteUrl: inviteUrl(req, token), expiresAt: w.expiresAt })
}

const invite = withTarget(async (req, row) => {
  const token = newInviteToken()
  const w = inviteWindow()
  await req.payload.update({ collection: 'users', id: row.id, data: {}, user: req.user, overrideAccess: false, context: { ...ctx, selectorInvite: { hash: hashInviteToken(token), expiresAt: w.expiresAt, invitedAt: w.invitedAt } } })
  return Response.json({ ok: true, id: row.id, inviteUrl: inviteUrl(req, token), expiresAt: w.expiresAt })
})

const unlink = withTarget(async (req, row) => {
  await req.payload.update({ collection: 'users', id: row.id, data: { facebookId: null }, user: req.user, overrideAccess: false, context: ctx })
  return Response.json({ ok: true })
})

const setDisabled = (disabled: boolean) =>
  withTarget(async (req, row) => {
    await req.payload.update({ collection: 'users', id: row.id, data: { disabled }, user: req.user, overrideAccess: false, context: ctx })
    return Response.json({ ok: true })
  })

const setPassword = withTarget(async (req, row, body) => {
  const password = typeof body.password === 'string' ? body.password : ''
  if (password.length < MIN_PASSWORD_LENGTH) return fail(400, `Use at least ${MIN_PASSWORD_LENGTH} characters for the password.`)
  await req.payload.update({ collection: 'users', id: row.id, data: { password }, user: req.user, overrideAccess: false, context: { ...ctx, skipCurrentPassword: true } })
  return Response.json({ ok: true })
})

const remove = withTarget(async (req, row) => {
  await req.payload.delete({ collection: 'users', id: row.id, user: req.user, overrideAccess: false, context: ctx })
  return Response.json({ ok: true })
})

const post = (path: string, handler: Handler): Endpoint => ({ path: `/selectors/${path}`, method: 'post', handler: guarded(handler) })

export const selectorEndpoints: Endpoint[] = [
  post('create', create),
  post('invite', invite),
  post('unlink', unlink),
  post('disable', setDisabled(true)),
  post('enable', setDisabled(false)),
  post('set-password', setPassword),
  post('remove', remove),
]
