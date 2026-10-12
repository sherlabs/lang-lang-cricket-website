import 'server-only'
import { sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload, TypedUser, Where } from 'payload'
import { getPayloadClient } from '@/lib/payload/client'
import { currentClubDate } from '@/lib/selection/club-date'
import { isAdminUser, isStaffUser } from '@/payload/access'
import { auditFilterSummary, memberWhere, PAGE_SIZE, type MemberQuery } from './office/member-filters'
import { sanitiseSummary } from './office/audit'
import { writeAudit } from './office/audit-write'
import { displayNameFor, memberIsJunior } from './office/members'
import { memberExportTable, type ExportMember } from './office/member-export'
import { getOfficeSettings } from './office/settings-server'
import { isNameScreen, projectNames, SCREEN_ROLES, type NameRow, type NameScreen, type ProjectedName } from './office/names'
import { validateQuickAdd, type MemberFormError } from './office/member-input'
import { MEMBER_ROLES } from './office/members'

/**
 * The only data layer for members (wave D spec section 3). Nothing here is reachable from a public page. Every function checks the
 * caller itself (the Local API ignores access unless told otherwise) and reads with `overrideAccess: false, user` where the caller
 * is an admin, so the collection and field rules apply too. Editors get names only, through `listMemberNames`.
 */
const adminOnly = (user: unknown): user is TypedUser => isAdminUser(user as never)

export type DirectoryRow = {
  id: number
  name: string
  roles: string[]
  status: 'active' | 'past'
  email: string | null
  phone: string | null
  junior: boolean
  hasGuardian: boolean
  doNotEmail: boolean
  erased: boolean
  playerLinked: boolean
}

export type Directory = { rows: DirectoryRow[]; total: number; page: number; totalPages: number }

type MemberDoc = {
  id: number
  displayName?: string | null
  firstName?: string | null
  lastName?: string | null
  preferredName?: string | null
  roles?: string[] | null
  status?: 'active' | 'past' | null
  email?: string | null
  phone?: string | null
  dateOfBirth?: string | null
  guardians?: unknown[] | null
  doNotEmail?: boolean | null
  erasedAt?: string | null
  player?: { id: number; displayName?: string | null; firstName?: string | null; lastName?: string | null; isJunior?: boolean | null } | number | null
  person?: { name?: string | null } | number | null
}
const obj = <T extends object>(v: T | number | null | undefined): T | null => (v && typeof v === 'object' ? v : null)

/** A page of the directory. The name shown is live from the linked player; the stored title only drives the native list. */
export async function listMembers(user: unknown, query: MemberQuery): Promise<Directory | null> {
  if (!adminOnly(user)) return null
  const payload = await getPayloadClient()
  const today = currentClubDate()
  const res = await payload.find({
    collection: 'members',
    where: memberWhere(query, today),
    sort: 'displayName',
    page: query.page,
    limit: PAGE_SIZE,
    depth: 1,
    user,
    overrideAccess: false,
  })
  const rows = (res.docs as unknown as MemberDoc[]).map((m): DirectoryRow => {
    const player = obj(m.player)
    const erased = Boolean(m.erasedAt)
    return {
      id: m.id,
      name: displayNameFor({ ...m, player, person: obj(m.person) }),
      roles: m.roles ?? [],
      status: m.status === 'past' ? 'past' : 'active',
      email: m.email ?? null,
      phone: m.phone ?? null,
      junior: !erased && memberIsJunior({ dateOfBirth: m.dateOfBirth, player }, today),
      hasGuardian: (m.guardians ?? []).length > 0,
      doNotEmail: m.doNotEmail === true,
      erased,
      playerLinked: player !== null || typeof m.player === 'number',
    }
  })
  return { rows, total: res.totalDocs, page: res.page ?? 1, totalPages: Math.max(1, res.totalPages) }
}

export type Completeness = { total: number; noEmail: number; noPhone: number; noBoth: number }

/** Counts over active members only; the email count also leaves out people on the do-not-email list (wording in `officeCopy`). */
export async function memberCompleteness(user: unknown): Promise<Completeness | null> {
  if (!adminOnly(user)) return null
  const payload = await getPayloadClient()
  const active: Where = { status: { equals: 'active' } }
  const count = async (extra: Where[]) => (await payload.count({ collection: 'members', where: { and: [active, ...extra] }, user, overrideAccess: false })).totalDocs
  const [total, noEmail, noPhone, noBoth] = await Promise.all([
    count([]),
    count([{ email: { exists: false } }, { doNotEmail: { not_equals: true } }]),
    count([{ phone: { exists: false } }]),
    count([{ email: { exists: false } }, { phone: { exists: false } }]),
  ])
  return { total, noEmail, noPhone, noBoth }
}

/** Email addresses held by more than one member (emails are stored lowercase, so grouping is exact). Count only, never the addresses. */
export async function duplicateEmailCount(user: unknown): Promise<number | null> {
  if (!adminOnly(user)) return null
  const payload = await getPayloadClient()
  const res = await payload.db.drizzle.execute(sql`SELECT count(*)::int AS n FROM (SELECT email FROM "payload"."members" WHERE email IS NOT NULL GROUP BY email HAVING count(*) > 1) d`)
  return (res.rows[0] as { n: number } | undefined)?.n ?? 0
}

/** Members sharing an email with another member: ids only, for the "shared email" flag on rows. */
export async function duplicateEmailMemberIds(user: unknown): Promise<Set<number>> {
  if (!adminOnly(user)) return new Set()
  const payload = await getPayloadClient()
  const res = await payload.db.drizzle.execute(sql`SELECT id FROM "payload"."members" WHERE email IN (SELECT email FROM "payload"."members" WHERE email IS NOT NULL GROUP BY email HAVING count(*) > 1)`)
  return new Set((res.rows as { id: number }[]).map((r) => r.id))
}

/**
 * Names for a screen, for the committee (wave D spec section 1). Staff only; `{ id, displayName }` and nothing else, only for
 * members relevant to the screen, juniors as first name and last initial. Reads with the access override on purpose (an editor
 * cannot read members), so the projection is the whole disclosure.
 */
export async function listMemberNames(user: unknown, screen: NameScreen): Promise<ProjectedName[]> {
  if (!isStaffUser(user as never) || !isNameScreen(screen)) return []
  const payload = await getPayloadClient()
  const res = await payload.find({
    collection: 'members',
    where: { and: [{ status: { equals: 'active' } }, { roles: { in: [...SCREEN_ROLES[screen]] } }] },
    pagination: false,
    depth: 1,
    overrideAccess: true,
    select: { firstName: true, lastName: true, preferredName: true, roles: true, status: true, dateOfBirth: true, erasedAt: true, player: true, person: true },
  })
  const rows = (res.docs as unknown as MemberDoc[]).map((m): NameRow => ({ ...m, player: obj(m.player), person: obj(m.person) }))
  return projectNames(rows, screen, currentClubDate())
}

export type AddMemberResult = { ok: true; id: number } | { ok: false; code: MemberFormError }

/** Quick add: name, roles, email, phone. The creator, the source and every default are set here, never taken from the form. */
export async function addMember(user: unknown, raw: Parameters<typeof validateQuickAdd>[0]): Promise<AddMemberResult> {
  if (!adminOnly(user)) return { ok: false, code: 'forbidden' }
  const checked = validateQuickAdd(raw, MEMBER_ROLES)
  if (!checked.ok) return checked
  const payload = await getPayloadClient()
  const { firstName, lastName, roles, email, phone } = checked.value
  try {
    const doc = await payload.create({
      collection: 'members',
      data: { firstName, lastName, roles: roles as never, email, phone, status: 'active', importedFrom: 'manual' },
      user,
      overrideAccess: false,
      depth: 0,
    })
    return { ok: true, id: doc.id }
  } catch (err) {
    console.warn('[office] add member failed:', (err as Error).message)
    return { ok: false, code: 'save' }
  }
}

/**
 * "Add members for players who have none": one linked, contact-free member per player without one. Currently active players start
 * Active, the rest Past. Idempotent: the unique player link refuses a second row, so a double click adds nothing twice.
 */
export async function linkPlayersAsMembers(user: unknown): Promise<{ created: number } | null> {
  if (!adminOnly(user)) return null
  const payload = await getPayloadClient()
  const res = await payload.db.drizzle.execute(
    sql`SELECT p.id, p.is_active_derived AS active FROM "payload"."players" p LEFT JOIN "payload"."members" m ON m.player_id = p.id WHERE m.id IS NULL ORDER BY p.id`,
  )
  let created = 0
  for (const row of res.rows as { id: number; active: boolean | null }[]) {
    try {
      await payload.create({
        collection: 'members',
        data: { player: row.id, roles: ['player'], status: row.active ? 'active' : 'past', importedFrom: 'players' },
        overrideAccess: true,
        depth: 0,
      })
      created++
    } catch (err) {
      // A unique violation means another click got there first; anything else is logged and skipped.
      if (!/unique|duplicate/i.test((err as Error).message)) console.warn('[office] link player failed:', (err as Error).message)
    }
  }
  await writeAudit(payload, { userId: user.id, action: 'bulk-change', module: 'members', summary: sanitiseSummary({ operation: 'link-players', created }, { operation: ['link-players'], created: 'number' }), rowCount: created, includedSensitive: false })
  return { created }
}

export const EXPORT_SUMMARY_SPEC = {
  status: ['any', 'active', 'past'],
  role: ['any', ...MEMBER_ROLES],
  juniors: 'boolean',
  missing: ['none', 'email', 'phone', 'both', 'guardian'],
  hasSearch: 'boolean',
} as const

/** Members matching the filter as export rows. Called only from `auditedExport`'s `build`, after the admin check. */
export async function membersForExport(payload: Payload, user: TypedUser, query: MemberQuery, includeSensitive: boolean) {
  const settings = await getOfficeSettings(user)
  const res = await payload.find({
    collection: 'members',
    where: memberWhere(query, currentClubDate()),
    sort: 'displayName',
    pagination: false,
    depth: 1,
    user,
    overrideAccess: false,
  })
  const members = (res.docs as unknown as (MemberDoc & ExportMember)[]).map((m) => ({ ...m, player: obj(m.player), person: obj(m.person) }) as ExportMember)
  return memberExportTable(members, settings.addressLabels, includeSensitive)
}

export { auditFilterSummary }
