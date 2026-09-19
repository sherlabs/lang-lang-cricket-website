'use server'

import { revalidatePath } from 'next/cache'
import { del } from '@vercel/blob'
import { asc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { sponsors } from '@/db/schema'
import { TIERS } from '@/components/sponsor-logos'

export type SponsorInput = { tier: string; name: string; linkUrl: string; logoUrl: string }

function revalidate() {
  revalidatePath('/sponsors')
  revalidatePath('/')
  revalidatePath('/admin/sponsors')
}

function clean(input: SponsorInput): SponsorInput {
  const tier = TIERS.includes(input.tier) ? input.tier : 'Bronze'
  return {
    tier,
    name: String(input.name ?? '').trim(),
    linkUrl: String(input.linkUrl ?? '').trim(),
    logoUrl: String(input.logoUrl ?? '').trim(),
  }
}

function isBlob(url: string) {
  return url.includes('.blob.vercel-storage.com')
}

export async function listSponsors() {
  return db.select().from(sponsors).orderBy(asc(sponsors.id))
}

export async function createSponsor(input: SponsorInput) {
  const data = clean(input)
  if (!data.name) throw new Error('Name is required')
  await db.insert(sponsors).values(data)
  revalidate()
}

export async function updateSponsor(id: number, input: SponsorInput) {
  const data = clean(input)
  if (!data.name) throw new Error('Name is required')
  const [prev] = await db.select().from(sponsors).where(eq(sponsors.id, id))
  await db.update(sponsors).set(data).where(eq(sponsors.id, id))
  // Logo was replaced: drop the old blob so storage doesn't fill with orphans.
  if (prev && prev.logoUrl !== data.logoUrl && isBlob(prev.logoUrl)) {
    await del(prev.logoUrl).catch(() => {})
  }
  revalidate()
}

export async function removeSponsor(id: number) {
  const [row] = await db.select().from(sponsors).where(eq(sponsors.id, id))
  if (!row) return
  await db.delete(sponsors).where(eq(sponsors.id, id))
  if (isBlob(row.logoUrl)) await del(row.logoUrl).catch(() => {})
  revalidate()
}
