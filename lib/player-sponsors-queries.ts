import 'server-only'
import { resolvePhotoUrl } from '@/lib/identity'
import { getLinkedPeople } from '@/lib/people-queries'
import { getPayloadClient } from '@/lib/payload/client'
import { mediaUrl, toPlayer } from '@/lib/payload/mappers'
import { shownName } from '@/lib/players/view'
import type { PlayerSponsor as PlayerSponsorDoc } from '@/payload-types'

/** One player sponsorship as the public pages show it. */
export type PlayerSponsorTile = {
  id: number
  sponsorId: number
  playerId: number
  playerSlug: string
  playerName: string
  /** Resolved with the shared identity rule (player photo, else the linked person's). */
  playerPhotoUrl: string
  sponsorName: string
  sponsorLogoUrl: string
  sponsorLinkUrl: string
  season: string
  message: string
  featured: boolean
}

/**
 * Active sponsorships whose player and sponsor still exist and whose player is not hidden.
 * The Local API runs with overrideAccess, so the REST rule (active + visible player) is
 * repeated here. Featured first, then `sortOrder`, then id.
 */
export async function listPlayerSponsorTiles(): Promise<PlayerSponsorTile[]> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'player-sponsors',
    where: { active: { equals: true } },
    sort: ['-featured', 'sortOrder', 'id'],
    pagination: false,
    depth: 2,
  })
  const usable = docs.filter(
    (d): d is PlayerSponsorDoc & { player: Exclude<PlayerSponsorDoc['player'], number>; sponsor: Exclude<PlayerSponsorDoc['sponsor'], number> } =>
      typeof d.player === 'object' && d.player !== null && !d.player.hidden && typeof d.sponsor === 'object' && d.sponsor !== null,
  )
  const people = await getLinkedPeople([...new Set(usable.map((d) => d.player.id))])
  return usable.map((d) => {
    const player = toPlayer(d.player)
    return {
      id: d.id,
      sponsorId: d.sponsor.id,
      playerId: player.id,
      playerSlug: player.slug,
      playerName: shownName(player),
      playerPhotoUrl: resolvePhotoUrl(player.photoUrl, people.get(player.id)?.photoUrl),
      sponsorName: d.sponsor.name,
      sponsorLogoUrl: mediaUrl(d.sponsor.logo),
      sponsorLinkUrl: d.sponsor.linkUrl ?? '',
      season: d.season ?? '',
      message: d.message ?? '',
      featured: Boolean(d.featured),
    }
  })
}

/** Sponsorships of one player (the "Sponsored by" block). */
export async function listSponsorsOfPlayer(playerId: number): Promise<PlayerSponsorTile[]> {
  return (await listPlayerSponsorTiles()).filter((t) => t.playerId === playerId)
}

/** sponsor id -> the players they back, for the "Sponsors <player>" line on /sponsors. */
export function playersBySponsor(tiles: readonly PlayerSponsorTile[]): Map<number, { slug: string; name: string }[]> {
  const out = new Map<number, { slug: string; name: string }[]>()
  for (const t of tiles) {
    const list = out.get(t.sponsorId) ?? []
    if (!list.some((p) => p.slug === t.playerSlug)) list.push({ slug: t.playerSlug, name: t.playerName })
    out.set(t.sponsorId, list)
  }
  return out
}
