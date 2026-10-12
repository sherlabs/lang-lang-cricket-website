import { isNetwork, type Network } from './adapters/types'
import { cleanHashtags } from './final-text'
import { cleanText, isGraphicType, isSizeKey, isStyleKey, type GraphicType, type RawParams, type SizeKey, type StyleKey } from './types'

/**
 * What a queued post remembers about its picture (wave C spec 4.4): the choice, the style, and a snapshot of the data the picture is
 * drawn from, frozen when the post is saved. The signed picture route and the publisher render from this, never from live data, so a
 * match edited after approval cannot change an approved picture.
 */
export type SnapshotPlayer = { id: number; name: string; version: string }
export type PostSpec = {
  type: GraphicType
  style: StyleKey
  raw: RawParams
  snapshot: { data: unknown; players: SnapshotPlayer[] }
  playerIds: number[]
  sponsorIds: number[]
  eventId?: number
  gameId?: string
}

type Dict = Record<string, unknown>
const list = (v: unknown): Dict[] => (Array.isArray(v) ? (v.filter((x) => typeof x === 'object' && x !== null) as Dict[]) : [])
const name = (v: unknown): string[] => (typeof v === 'string' && v.trim() ? [v] : [])

/**
 * The player names a graphic's data shows, by type. These are matched to visible players when the post is saved (the snapshot) and
 * checked again at publish time. Withheld and guest placeholders are not names.
 */
export function playerNamesIn(type: GraphicType, data: unknown, placeholders: readonly string[] = []): string[] {
  const d = (typeof data === 'object' && data !== null ? data : {}) as Dict
  let names: string[] = []
  switch (type) {
    case 'potm':
    case 'milestone':
      names = name(d.player)
      break
    case 'stats-leaders':
      names = list(d.rows).flatMap((r) => name(r.name))
      break
    case 'result':
      names = [...list(d.batters), ...list(d.bowlers)].flatMap((r) => name(r.name))
      break
    case 'lineup':
      names = list(d.players).flatMap((r) => name(r.name))
      break
    case 'season-wrap':
      names = [...name((d.topRuns as Dict | null)?.name), ...name((d.topWickets as Dict | null)?.name)]
      break
    default:
      names = []
  }
  return [...new Set(names.filter((n) => !placeholders.includes(n)))]
}

/** A short title for lists: the picture kind and a subject. */
export function postTitle(label: string, subject: string): string {
  return [label, subject].filter(Boolean).join(': ').slice(0, 120)
}

export type PostInput = {
  id: number | null
  type: GraphicType
  source: string
  text: string
  style: StyleKey | null
  caption: string
  hashtags: string[]
  targets: { network: Network; size: SizeKey }[]
  date: string | null
  time: string | null
  allowOutside: boolean
}
export type PostInputResult = { ok: true; value: PostInput } | { ok: false; error: string }

export const CAPTION_MAX = 5000
const isObj = (v: unknown): v is Dict => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Shape check for what the composer sends. Status, approver and creator are never read from it. */
export function validatePostInput(input: unknown): PostInputResult {
  if (!isObj(input)) return { ok: false, error: 'Something went wrong. Please try again.' }
  if (!isGraphicType(input.type)) return { ok: false, error: 'Pick what to post first.' }
  const source = typeof input.source === 'string' ? input.source.trim().slice(0, 160) : ''
  if (!source) return { ok: false, error: 'Pick what the picture is about.' }
  if (input.style != null && !isStyleKey(input.style)) return { ok: false, error: 'That style is not available.' }
  const caption = typeof input.caption === 'string' ? input.caption.replace(/\r\n/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim() : ''
  if (caption.length > CAPTION_MAX) return { ok: false, error: `Keep the caption to ${CAPTION_MAX} characters or fewer.` }
  const rawTags = Array.isArray(input.hashtags) ? input.hashtags.filter((t): t is string => typeof t === 'string') : []
  const hashtags = cleanHashtags(rawTags)
  if (hashtags.length !== new Set(rawTags.map((t) => t.replace(/^#/, '').trim()).filter(Boolean)).size) return { ok: false, error: 'A hashtag can use letters, numbers and underscores only.' }
  const targets: PostInput['targets'] = []
  for (const t of Array.isArray(input.targets) ? input.targets : []) {
    if (!isObj(t) || !isNetwork(t.network) || !isSizeKey(t.size)) return { ok: false, error: 'Check the networks you picked.' }
    if (targets.some((x) => x.network === t.network)) return { ok: false, error: 'Each network can be picked once.' }
    targets.push({ network: t.network, size: t.size })
  }
  const id = typeof input.id === 'number' && Number.isInteger(input.id) && input.id > 0 ? input.id : null
  return {
    ok: true,
    value: {
      id,
      type: input.type,
      source,
      text: cleanText(input.text),
      style: input.style == null ? null : (input.style as StyleKey),
      caption,
      hashtags,
      targets,
      date: typeof input.date === 'string' && input.date ? input.date : null,
      time: typeof input.time === 'string' && input.time ? input.time : null,
      allowOutside: input.allowOutside === true,
    },
  }
}

export type Blocker = string

/** Why Schedule is disabled right now (plain reasons). The same function runs in the composer and, authoritatively, on the server. */
export function scheduleBlockers(o: {
  networks: readonly { id: Network; label: string }[]
  selected: readonly { network: Network; size: SizeKey }[]
  siteUrlOk: boolean
  captionErrors: readonly string[]
  /** The words the person wrote, before any sign-off or hashtags are added. */
  body?: string
  timeError: string | null
}): Blocker[] {
  const out: Blocker[] = []
  if (o.networks.length === 0) out.push('No network is connected for scheduling yet. Download the picture and post it by hand.')
  else if (o.selected.length === 0) out.push('Pick at least one network.')
  else if (o.selected.some((s) => !o.networks.some((n) => n.id === s.network))) out.push('One of the networks you picked is not available.')
  if (!o.siteUrlOk) out.push('The site address is not a public https address, so networks cannot fetch the picture.')
  if (o.body !== undefined && !o.body.trim()) out.push('Write the words to go with the picture.')
  out.push(...o.captionErrors)
  if (o.timeError) out.push(o.timeError)
  return out
}
