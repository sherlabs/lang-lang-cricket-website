'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { asc, count, eq, inArray } from 'drizzle-orm'
import { db } from '@/db'
import {
  playerAliases,
  playerHonours,
  playerSeasons,
  players,
  type Player,
  type PlayerHonour,
  type PlayerSeason,
  type PlayerSyncRun,
} from '@/db/schema'
import { COOKIE_NAME, verifySessionCookie } from '@/lib/auth'
import { makeUniqueSlug } from '@/lib/slugify'
import { planMerge } from '@/lib/players/merge'
import { latestSyncRun, revalidatePlayerPages, syncPlayers, type SyncResult } from '@/lib/players/sync'
import { isActive, playerName } from '@/lib/players/view'

async function requireAdmin() {
  const token = cookies().get(COOKIE_NAME)?.value
  if (!token || !(await verifySessionCookie(token))) {
    throw new Error('Unauthorized')
  }
}

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim()
const override = (v: string) => (v === 'active' || v === 'past' ? v : null)

function toId(v: unknown): number {
  const id = Number(v)
  if (!Number.isInteger(id) || id <= 0) throw new Error('Player not found.')
  return id
}

export type AdminPlayerRow = Player & { active: boolean; name: string; seasonsCount: number; aliasCount: number }

export async function listPlayersAdmin(): Promise<AdminPlayerRow[]> {
  await requireAdmin()
  const [all, seasonCounts, aliasCounts] = await Promise.all([
    db.select().from(players).orderBy(asc(players.firstName), asc(players.lastName)),
    db.select({ playerId: playerSeasons.playerId, n: count() }).from(playerSeasons).groupBy(playerSeasons.playerId),
    db.select({ playerId: playerAliases.playerId, n: count() }).from(playerAliases).groupBy(playerAliases.playerId),
  ])
  const seasonsById = new Map(seasonCounts.map((c) => [c.playerId, Number(c.n)]))
  const aliasesById = new Map(aliasCounts.map((c) => [c.playerId, Number(c.n)]))
  return all.map((p) => ({
    ...p,
    active: isActive(p),
    name: playerName(p),
    seasonsCount: seasonsById.get(p.id) ?? 0,
    aliasCount: aliasesById.get(p.id) ?? 0,
  }))
}

export async function getPlayerAdmin(
  id: number
): Promise<{ player: Player; honours: PlayerHonour[]; aliases: string[]; seasons: PlayerSeason[] } | null> {
  await requireAdmin()
  if (!Number.isInteger(id) || id <= 0) return null
  const [player] = await db.select().from(players).where(eq(players.id, id)).limit(1)
  if (!player) return null
  const [honours, aliases, seasons] = await Promise.all([
    db
      .select()
      .from(playerHonours)
      .where(eq(playerHonours.playerId, id))
      .orderBy(asc(playerHonours.sortOrder), asc(playerHonours.id)),
    db.select().from(playerAliases).where(eq(playerAliases.playerId, id)),
    db
      .select()
      .from(playerSeasons)
      .where(eq(playerSeasons.playerId, id))
      .orderBy(asc(playerSeasons.seasonOrder), asc(playerSeasons.teamName)),
  ])
  return { player, honours, aliases: aliases.map((a) => a.nameKey), seasons }
}

export async function getSyncStatus(): Promise<PlayerSyncRun | null> {
  await requireAdmin()
  return latestSyncRun()
}

export type SyncState = { result: SyncResult | null }

// Signature matches useFormState: (prevState, formData) → state.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function runPlayerSync(_prev: SyncState, _formData: FormData): Promise<SyncState> {
  await requireAdmin()
  return { result: await syncPlayers() }
}

/** Fields: id, firstName, lastName, photoUrl, bio, manualYears (manual players only), activeOverride, hidden. */
export async function updatePlayer(formData: FormData): Promise<void> {
  await requireAdmin()
  const id = toId(formData.get('id'))
  const firstName = str(formData, 'firstName')
  if (!firstName) throw new Error('First name is required.')
  await db
    .update(players)
    .set({
      firstName,
      lastName: str(formData, 'lastName'),
      photoUrl: str(formData, 'photoUrl'),
      bio: str(formData, 'bio'),
      // The field is only rendered for manual players — don't blank it for PlayHQ ones.
      ...(formData.has('manualYears') ? { manualYears: str(formData, 'manualYears') } : {}),
      activeOverride: override(str(formData, 'activeOverride')),
      hidden: formData.get('hidden') === 'on',
      updatedAt: new Date(),
    })
    .where(eq(players.id, id))
  revalidatePlayerPages()
}

export type HonourInput = { years: string; title: string }

/** Replaces the player's honours with `honours` in the given order; rows without a title are dropped. */
export async function saveHonours(playerId: number, honours: HonourInput[]): Promise<void> {
  await requireAdmin()
  const id = toId(playerId)
  const clean = (Array.isArray(honours) ? honours : [])
    .map((h) => ({ years: String(h?.years ?? '').trim(), title: String(h?.title ?? '').trim() }))
    .filter((h) => h.title)
  await db.batch([
    db.delete(playerHonours).where(eq(playerHonours.playerId, id)),
    ...(clean.length ? [db.insert(playerHonours).values(clean.map((h, i) => ({ ...h, playerId: id, sortOrder: i })))] : []),
  ] as never)
  revalidatePlayerPages()
}

/** Adds a pre-PlayHQ player, then redirects to their edit page. */
export async function createManualPlayer(formData: FormData): Promise<void> {
  await requireAdmin()
  const firstName = str(formData, 'firstName')
  const lastName = str(formData, 'lastName')
  if (!firstName) throw new Error('First name is required.')
  const slug = await makeUniqueSlug(
    `${firstName} ${lastName}`,
    async (s) => (await db.select({ id: players.id }).from(players).where(eq(players.slug, s)).limit(1)).length > 0
  )
  const [row] = await db
    .insert(players)
    .values({
      slug,
      firstName,
      lastName,
      source: 'manual',
      photoUrl: str(formData, 'photoUrl'),
      bio: str(formData, 'bio'),
      manualYears: str(formData, 'manualYears'),
      activeOverride: override(str(formData, 'activeOverride')),
    })
    .returning({ id: players.id })
  revalidatePlayerPages()
  redirect(`/admin/players/${row.id}`)
}

export async function deleteManualPlayer(id: number): Promise<void> {
  await requireAdmin()
  const playerId = toId(id)
  const [p] = await db.select({ id: players.id, source: players.source }).from(players).where(eq(players.id, playerId)).limit(1)
  if (!p) return
  if (p.source !== 'manual') throw new Error('Only manually added players can be deleted.')
  await db.delete(players).where(eq(players.id, playerId))
  revalidatePlayerPages()
}

/** Deletes a manual player and sends the admin back to the list (their edit page would 404). */
export async function deleteManualPlayerAndReturn(id: number): Promise<void> {
  await deleteManualPlayer(id)
  redirect('/admin/players')
}

/** Folds `sourceId` into `targetId`: seasons, aliases and honours move; the source player is deleted. */
export async function mergePlayers(sourceId: number, targetId: number): Promise<void> {
  await requireAdmin()
  if (sourceId === targetId) throw new Error('Pick a different player to merge into.')
  const sId = toId(sourceId)
  const tId = toId(targetId)
  const [source, target] = await Promise.all([getRow(sId), getRow(tId)])
  if (!source || !target) throw new Error('Player not found.')
  const [sourceSeasons, targetSeasons] = await Promise.all([seasonsOf(sId), seasonsOf(tId)])
  const plan = planMerge(source, target, sourceSeasons, targetSeasons)
  // neon-http batch = one transaction, so a failure leaves both players untouched.
  await db.batch([
    db.update(players).set({ ...plan.targetPatch, updatedAt: new Date() }).where(eq(players.id, tId)),
    db.update(playerAliases).set({ playerId: tId }).where(eq(playerAliases.playerId, sId)),
    db.update(playerHonours).set({ playerId: tId }).where(eq(playerHonours.playerId, sId)),
    ...plan.combine.map((c) => db.update(playerSeasons).set(c.counts).where(eq(playerSeasons.id, c.targetRowId))),
    ...(plan.combine.length
      ? [db.delete(playerSeasons).where(inArray(playerSeasons.id, plan.combine.map((c) => c.sourceRowId)))]
      : []),
    ...(plan.moveSeasonIds.length
      ? [db.update(playerSeasons).set({ playerId: tId }).where(inArray(playerSeasons.id, plan.moveSeasonIds))]
      : []),
    db.delete(players).where(eq(players.id, sId)),
  ] as never)
  revalidatePlayerPages()
}

async function getRow(id: number): Promise<Player | null> {
  return (await db.select().from(players).where(eq(players.id, id)).limit(1))[0] ?? null
}

function seasonsOf(id: number): Promise<PlayerSeason[]> {
  return db.select().from(playerSeasons).where(eq(playerSeasons.playerId, id))
}
