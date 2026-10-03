/**
 * Merge duplicate `people` rows (the same human entered once per job) into ONE record with
 * `moreRoles`. Pure planning (`planDedupe`) plus an executor that takes a Payload instance
 * (`runDedupe`); the operator script payload/scripts/dedupe-people.ts adds the database guard.
 *
 * Nothing else references a person id: `players.committeeRoles` is a derived join over
 * `people.player`, and the player link lives on the person row itself, so deleting a duplicate
 * needs no repointing (the link is copied to the kept row instead).
 */
import type { Payload } from 'payload'
import type { PersonRole } from '../../lib/people'
import { sectionOf } from '../../lib/people'

export type DedupeRow = {
  id: number
  name: string
  role: string
  section: string
  moreRoles: PersonRole[]
  phone: string
  email: string
  photoId: number | null
  playerId: number | null
}

export type ScalarField = 'phone' | 'email' | 'photoId' | 'playerId'
const FIELDS: ScalarField[] = ['phone', 'email', 'photoId', 'playerId']
const FIELD_LABEL: Record<ScalarField, string> = { phone: 'phone', email: 'email', photoId: 'photo', playerId: 'player link' }

export type DedupeGroup = {
  name: string
  keepId: number
  mergedIds: number[]
  copied: { field: string; from: number; value: string | number }[]
  addedRoles: (PersonRole & { from: number })[]
  skippedRoles: (PersonRole & { from: number; why: string })[]
  conflicts: { field: string; values: { id: number; value: string | number }[] }[]
  /** True when the group will be left untouched (conflicts without --prefer-primary). */
  skipped: boolean
  /** What to write on the kept row when not skipped. */
  update: { phone?: string; email?: string; photoId?: number; playerId?: number; moreRoles: PersonRole[] }
}

export const normaliseKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase()

const isEmpty = (v: string | number | null | undefined) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '')
const compareKey = (f: ScalarField, v: string | number) => (typeof v === 'string' ? (f === 'email' ? v.trim().toLowerCase() : v.replace(/\s+/g, '')) : v)

function filledCount(r: DedupeRow): number {
  return [r.name, r.role, r.phone, r.email, r.photoId, r.playerId].filter((v) => !isEmpty(v)).length + r.moreRoles.length
}

/** Primary: has a photo, then most filled fields, then lowest id. */
export function pickPrimary(rows: readonly DedupeRow[]): DedupeRow {
  return [...rows].sort((a, b) => Number(!isEmpty(b.photoId)) - Number(!isEmpty(a.photoId)) || filledCount(b) - filledCount(a) || a.id - b.id)[0]!
}

const roleKey = (r: PersonRole) => `${r.role.trim().toLowerCase()}|${sectionOf(r.section)}`

export function planDedupe(rows: readonly DedupeRow[], opts: { preferPrimary?: boolean } = {}): DedupeGroup[] {
  const groups = new Map<string, DedupeRow[]>()
  for (const r of rows) {
    const k = normaliseKey(r.name)
    if (!k) continue
    groups.set(k, [...(groups.get(k) ?? []), r])
  }
  const out: DedupeGroup[] = []
  for (const members of groups.values()) {
    if (members.length < 2) continue
    const primary = pickPrimary(members)
    const donors = members.filter((m) => m.id !== primary.id).sort((a, b) => a.id - b.id)
    const group: DedupeGroup = {
      name: primary.name,
      keepId: primary.id,
      mergedIds: donors.map((d) => d.id),
      copied: [],
      addedRoles: [],
      skippedRoles: [],
      conflicts: [],
      skipped: false,
      update: { moreRoles: [] },
    }

    for (const f of FIELDS) {
      const present = members.filter((m) => !isEmpty(m[f]))
      const distinct = new Set(present.map((m) => compareKey(f, m[f] as string | number)))
      if (distinct.size > 1) group.conflicts.push({ field: FIELD_LABEL[f], values: present.map((m) => ({ id: m.id, value: m[f] as string | number })) })
      if (isEmpty(primary[f])) {
        const donor = donors.find((d) => !isEmpty(d[f]))
        // With a conflict, only --prefer-primary may continue; the first donor in id order fills the gap.
        if (donor && (distinct.size <= 1 || opts.preferPrimary)) {
          group.copied.push({ field: FIELD_LABEL[f], from: donor.id, value: donor[f] as string | number })
          ;(group.update as Record<string, unknown>)[f] = donor[f]
        }
      }
    }
    group.skipped = group.conflicts.length > 0 && !opts.preferPrimary

    const known = new Set([roleKey(primary), ...primary.moreRoles.map(roleKey)])
    const moreRoles: PersonRole[] = [...primary.moreRoles]
    for (const d of donors) {
      for (const r of [{ role: d.role, section: d.section }, ...d.moreRoles]) {
        const role = r.role.trim()
        if (!role) continue
        const entry = { role, section: sectionOf(r.section) }
        if (known.has(roleKey(entry))) {
          group.skippedRoles.push({ ...entry, from: d.id, why: 'same role and section already on the kept row' })
          continue
        }
        known.add(roleKey(entry))
        moreRoles.push(entry)
        group.addedRoles.push({ ...entry, from: d.id })
      }
    }
    group.update.moreRoles = moreRoles
    out.push(group)
  }
  return out.sort((a, b) => a.keepId - b.keepId)
}

const idOf = (v: unknown): number | null => (typeof v === 'number' ? v : v && typeof v === 'object' && 'id' in v ? (v as { id: number }).id : null)

export async function loadDedupeRows(payload: Payload): Promise<DedupeRow[]> {
  const { docs } = await payload.find({ collection: 'people', pagination: false, depth: 0, overrideAccess: true, sort: 'id' })
  return docs.map((d) => ({
    id: d.id,
    name: d.name,
    role: d.role,
    section: d.section ?? 'committee',
    moreRoles: (d.moreRoles ?? []).map((r) => ({ role: r.role, section: r.section ?? 'committee' })),
    phone: d.phone ?? '',
    email: d.email ?? '',
    photoId: idOf(d.photo),
    playerId: idOf(d.player),
  }))
}

export function formatReport(groups: readonly DedupeGroup[], apply: boolean, log: (line: string) => void): void {
  if (groups.length === 0) log('[dedupe] nothing to do: no person is listed twice')
  for (const g of groups) {
    log(`[dedupe] GROUP     "${g.name}": keep #${g.keepId}, merge ${g.mergedIds.map((i) => `#${i}`).join(', ')}${g.skipped ? ' - SKIPPED (conflict)' : ''}`)
    for (const c of g.copied) log(`[dedupe]   copy     ${c.field} = ${c.value} (from #${c.from})`)
    for (const r of g.addedRoles) log(`[dedupe]   role     + "${r.role}" under ${r.section} (from #${r.from})`)
    for (const r of g.skippedRoles) log(`[dedupe]   skipped  role "${r.role}" under ${r.section} (#${r.from}): ${r.why}`)
    for (const c of g.conflicts) log(`[dedupe]   CONFLICT ${c.field}: ${c.values.map((v) => `#${v.id}=${v.value}`).join(' vs ')}`)
  }
  const merging = groups.filter((g) => !g.skipped)
  log(`[dedupe] summary: ${groups.length} group(s), ${merging.length} to merge (${merging.reduce((n, g) => n + g.mergedIds.length, 0)} row(s) removed), ${groups.length - merging.length} skipped for conflicts`)
  if (groups.length - merging.length > 0) log('[dedupe] resolve skipped groups by hand, or re-run with --prefer-primary to keep the primary value on a conflict.')
  if (!apply && merging.length > 0) log('[dedupe] dry run: nothing written. Re-run with --apply --confirm to merge.')
}

/** Plan, and when `apply` write: update the kept row, then delete the duplicates. Idempotent. */
export async function runDedupe(payload: Payload, opts: { apply: boolean; preferPrimary?: boolean; log?: (line: string) => void }): Promise<DedupeGroup[]> {
  const log = opts.log ?? (() => undefined)
  const groups = planDedupe(await loadDedupeRows(payload), { preferPrimary: opts.preferPrimary })
  formatReport(groups, opts.apply, log)
  if (!opts.apply) return groups
  const context = { disableRevalidate: true }
  for (const g of groups.filter((x) => !x.skipped)) {
    await payload.update({
      collection: 'people',
      id: g.keepId,
      data: {
        ...(g.update.phone !== undefined ? { phone: g.update.phone } : {}),
        ...(g.update.email !== undefined ? { email: g.update.email } : {}),
        ...(g.update.photoId !== undefined ? { photo: g.update.photoId } : {}),
        ...(g.update.playerId !== undefined ? { player: g.update.playerId } : {}),
        moreRoles: g.update.moreRoles.map((r) => ({ role: r.role, section: sectionOf(r.section) })),
      },
      overrideAccess: true,
      depth: 0,
      context,
    })
    await payload.delete({ collection: 'people', where: { id: { in: g.mergedIds } }, overrideAccess: true, depth: 0, context })
  }
  if (groups.some((x) => !x.skipped)) log(`[dedupe] wrote ${groups.filter((x) => !x.skipped).length} merge(s)`)
  return groups
}
