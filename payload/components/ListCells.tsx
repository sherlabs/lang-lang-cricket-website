// @committee-facing
import type { DefaultServerCellComponentProps, Payload } from 'payload'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { adminMediaSrc, createBatchLoader, dateTile, fileTypeChip, newsStatus, onOff, playerStatus, type ListStatus } from '../../lib/admin/list-status'
import { isPastOneTimeEvent } from '../collections/Events'
import { Avatar, StatusPill } from './ui'

/**
 * List columns for the committee's everyday lists (wave G WP-4): photo thumbnails, status pills in words (never true/false) and a date
 * tile. Server cells; anything that needs the database goes through a per-request batch loader, so a page of 50 rows costs one lookup
 * per kind, not 50. A failed lookup shows the plain fallback instead of breaking the list.
 */
type Props = DefaultServerCellComponentProps

/**
 * One batch loader per Payload instance and kind. It only groups the lookups made in the same tick and keeps no results, so a loader
 * shared between requests never serves stale rows.
 */
function perPayload<A extends string, V>(make: (payload: Payload, arg: A) => (id: number) => Promise<V | undefined>) {
  const loaders = new WeakMap<Payload, Map<string, (id: number) => Promise<V | undefined>>>()
  return (payload: Payload, arg: A) => {
    let byArg = loaders.get(payload)
    if (!byArg) loaders.set(payload, (byArg = new Map()))
    let loader = byArg.get(arg)
    if (!loader) byArg.set(arg, (loader = make(payload, arg)))
    return loader
  }
}

const pill = (s: ListStatus) => (
  <StatusPill tone={s.tone} icon={s.icon}>
    {s.label}
  </StatusPill>
)

type MediaLite = { id: number; url?: string | null; filename?: string | null; mimeType?: string | null }
const isMedia = (v: unknown): v is MediaLite => Boolean(v) && typeof v === 'object' && 'id' in (v as object)

const mediaLoader = perPayload<'media', MediaLite>((payload) =>
  createBatchLoader<MediaLite>(async (ids) => {
    const { docs } = await payload.find({ collection: 'media', where: { id: { in: ids } }, depth: 0, limit: ids.length, pagination: false, overrideAccess: true })
    return new Map(docs.map((d) => [d.id as number, d as MediaLite]))
  }),
)

/** The picture behind an upload value, whether the list populated it (depth 1) or sent only the id. */
async function pictureUrl(payload: Payload, value: unknown): Promise<string | null> {
  const serverURL = payload.config.serverURL
  if (isMedia(value)) return adminMediaSrc(value.url, serverURL)
  if (typeof value === 'number') return adminMediaSrc((await mediaLoader(payload, 'media')(value))?.url, serverURL)
  return null
}

const nameOf = (row: Record<string, unknown>) => String(row.displayName ?? row.name ?? row.title ?? '')

/** Payload makes the first column a link to the record; a custom cell has to draw that link itself. */
function Linked({ props, label, children }: { props: Props; label?: string; children: ReactNode }) {
  const id = props.rowData?.id
  // Payload sets `linkURL` only when a collection formats its own addresses; otherwise the address is the record's own page.
  const href = props.linkURL ?? (id != null ? `${props.payload.config.routes.admin}/collections/${props.collectionSlug}/${encodeURIComponent(String(id))}` : null)
  if (props.link && href) {
    return (
      <Link className="club-cell-link" href={href} aria-label={label}>
        {children}
      </Link>
    )
  }
  return <>{children}</>
}

/**
 * The name column of a list with a picture: a small thumbnail beside the name, the whole thing the link to the record. `imageField` is
 * the upload field to show (`photo`, `logo`, `cover`); `fit` "contain" shows a logo whole.
 */
export async function NamedPhotoCell(props: Props & { imageField?: string; fit?: 'cover' | 'contain' }) {
  const url = await pictureUrl(props.payload, (props.rowData as Record<string, unknown> | undefined)?.[props.imageField ?? 'photo'])
  const name = String(props.cellData ?? nameOf(props.rowData ?? {}))
  return (
    <Linked props={props}>
      <span className="club-related">
        <Avatar src={url} name={name} size={44} fit={props.fit} />
        <span className="club-related__name">{name}</span>
      </span>
    </Linked>
  )
}

/** A true/false switch in words, for example "Showing on the website" / "Hidden". The words come from the field's `clientProps`. */
export function OnOffCell(props: Props & { on?: string; off?: string }) {
  return pill(onOff(props.cellData, { on: props.on ?? 'On', off: props.off ?? 'Off' }))
}

/** Players: "Playing now", "Past player" or "Hidden" from the row's own fields. */
export function PlayerStatusCell(props: Props) {
  const r = (props.rowData ?? {}) as { hidden?: boolean; activeOverride?: string; isActiveDerived?: boolean }
  return pill(playerStatus(r))
}

const gamesLoader = perPayload<'games', number>((payload) =>
  createBatchLoader<number>(async (ids) => {
    const { docs } = await payload.find({
      collection: 'player-seasons',
      where: { and: [{ player: { in: ids } }, { seasonOrder: { equals: 0 } }] },
      depth: 0,
      pagination: false,
      select: { player: true, games: true },
      overrideAccess: true,
    })
    const out = new Map<number, number>()
    for (const d of docs) {
      const id = typeof d.player === 'number' ? d.player : (d.player as { id: number }).id
      out.set(id, (out.get(id) ?? 0) + (typeof d.games === 'number' ? d.games : 0))
    }
    return out
  }),
)

/** Players: games in the newest season the stats store holds. */
export async function PlayerGamesCell(props: Props) {
  const id = props.rowData?.id
  const games = typeof id === 'number' ? await gamesLoader(props.payload, 'games')(id) : undefined
  return <span className="club-count-cell">{games ?? '–'}</span>
}

/** News: "Draft", "Scheduled" or "Showing on the website". */
export function NewsStatusCell(props: Props) {
  const r = (props.rowData ?? {}) as { status?: string; publishedAt?: string }
  return pill(newsStatus(r))
}

/** Sponsors: the website as its plain address (no https://), or a dash when there is none. */
export function WebsiteCell(props: Props) {
  const raw = typeof props.cellData === 'string' ? props.cellData.trim() : ''
  if (!raw) return <span className="club-count-cell">–</span>
  return <span className="club-related__name">{raw.replace(/^https?:\/\//i, '').replace(/\/$/, '')}</span>
}

/** Sponsors: the level as a small label. */
export function SponsorLevelCell(props: Props) {
  return <StatusPill tone={props.cellData === 'Platinum' || props.cellData === 'Gold' ? 'accent' : 'neutral'}>{String(props.cellData ?? '')}</StatusPill>
}

/** Events: a date tile for a one-off event, "Every <day>" for a weekly one. */
export function EventWhenCell(props: Props) {
  const r = (props.rowData ?? {}) as { type?: string; eventDate?: string; dayOfWeek?: string; title?: string }
  if (r.type === 'recurring') {
    const day = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][Number(r.dayOfWeek)] ?? ''
    return (
      <Linked props={props} label={String(r.title ?? '')}>
        <span className="club-date-weekly">{day ? `Every ${day}` : 'Every week'}</span>
      </Linked>
    )
  }
  const t = dateTile(r.eventDate)
  if (!t) {
    return (
      <Linked props={props} label={String((props.rowData as { title?: string } | undefined)?.title ?? '')}>
        <span className="club-date-weekly">No date yet</span>
      </Linked>
    )
  }
  return (
    <Linked props={props} label={String((props.rowData as { title?: string } | undefined)?.title ?? '')}>
      <span className="club-date-tile">
        <span className="club-date-tile__month">{t.month}</span>
        <span className="club-date-tile__day">{t.day}</span>
        <span className="club-date-tile__weekday">{t.weekday}</span>
      </span>
    </Linked>
  )
}

/** Events: coming up, finished, or weekly. */
export function EventStatusCell(props: Props) {
  const r = (props.rowData ?? {}) as Record<string, unknown>
  if (r.type === 'recurring') return pill({ key: 'weekly', label: 'Every week', tone: 'accent' })
  if (isPastOneTimeEvent(r)) return pill({ key: 'done', label: 'Finished', tone: 'neutral' })
  return pill({ key: 'soon', label: 'Coming up', tone: 'ok', icon: 'clock' })
}

/** Documents: the file type as a chip. */
export function FileTypeCell(props: Props) {
  const r = (props.rowData ?? {}) as { filename?: string; mimeType?: string }
  return <StatusPill>{fileTypeChip(r.filename, r.mimeType)}</StatusPill>
}

type Related = { id: number; name: string; url: string | null }
const relatedLoader = perPayload<'players' | 'sponsors', Related>((payload, collection) =>
  createBatchLoader<Related>(async (ids) => {
    const { docs } = await payload.find({ collection, where: { id: { in: ids } }, depth: 1, pagination: false, limit: ids.length, overrideAccess: true })
    return new Map(
      docs.map((d) => {
        const row = d as unknown as Record<string, unknown>
        const image = collection === 'players' ? row.photo : row.logo
        return [d.id as number, { id: d.id as number, name: nameOf(row), url: isMedia(image) ? adminMediaSrc(image.url, payload.config.serverURL) : null }]
      }),
    )
  }),
)

/** A relationship column (the player or sponsor on a sponsorship) as a picture and a name. */
export async function RelatedCell(props: Props & { collection?: 'players' | 'sponsors' }) {
  const kind = props.collection ?? 'players'
  const v = props.cellData
  const id = typeof v === 'number' ? v : isMedia(v) ? v.id : null
  if (id == null) return <span className="club-count-cell">–</span>
  const found = await relatedLoader(props.payload, kind)(id)
  const name = found?.name || (isMedia(v) ? nameOf(v as unknown as Record<string, unknown>) : '')
  return (
    <Linked props={props}>
      <span className="club-related">
        <Avatar src={found?.url} name={name} size={32} fit={kind === 'sponsors' ? 'contain' : 'cover'} />
        <span className="club-related__name">{name || `Item ${id}`}</span>
      </span>
    </Linked>
  )
}
