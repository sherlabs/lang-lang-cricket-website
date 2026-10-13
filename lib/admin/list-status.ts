/**
 * Plain-word statuses for the admin lists (wave G WP-4). Pure: the cells in `payload/components/ListCells.tsx` only draw what these return,
 * so the words, the tones and the rules for "playing now" and "scheduled" are testable without a database.
 */
export type ListTone = 'ok' | 'warn' | 'danger' | 'neutral' | 'accent'
export type ListStatus = { key: string; label: string; tone: ListTone; icon?: 'check' | 'pause' | 'clock' | 'edit' }

/** Hidden wins; otherwise the committee's "Show as" choice, otherwise what the stats update worked out (same rule as `lib/players/view.ts`). */
export function playerStatus(p: { hidden?: boolean | null; activeOverride?: string | null; isActiveDerived?: boolean | null }): ListStatus {
  if (p.hidden) return { key: 'hidden', label: 'Hidden', tone: 'neutral', icon: 'pause' }
  const active = p.activeOverride ? p.activeOverride === 'active' : Boolean(p.isActiveDerived)
  return active ? { key: 'playing', label: 'Playing now', tone: 'ok', icon: 'check' } : { key: 'past', label: 'Past player', tone: 'neutral' }
}

/** A switch shown in words instead of true/false. */
export function onOff(value: unknown, words: { on: string; off: string }): ListStatus {
  return value ? { key: 'on', label: words.on, tone: 'ok', icon: 'check' } : { key: 'off', label: words.off, tone: 'neutral', icon: 'pause' }
}

/** News: a draft, a post waiting for its date, or live. */
export function newsStatus(p: { status?: string | null; publishedAt?: string | null }, now: Date = new Date()): ListStatus {
  if (p.status !== 'published') return { key: 'draft', label: 'Draft', tone: 'warn', icon: 'edit' }
  const at = p.publishedAt ? new Date(p.publishedAt) : null
  if (at && !Number.isNaN(at.getTime()) && at.getTime() > now.getTime()) return { key: 'scheduled', label: 'Scheduled', tone: 'accent', icon: 'clock' }
  return { key: 'live', label: 'Showing on the website', tone: 'ok', icon: 'check' }
}

/** "Mon" and "14 Oct" for a date tile; the events store wall-clock dates as UTC midnight, so read them in UTC. */
export function dateTile(value: unknown): { day: string; month: string; weekday: string } | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  const opt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', ...o }).format(d)
  return { day: opt({ day: 'numeric' }), month: opt({ month: 'short' }), weekday: opt({ weekday: 'short' }) }
}

/** Short type chip for a file ("PDF", "JPG"). */
export function fileTypeChip(filename?: string | null, mimeType?: string | null): string {
  const ext = /\.([a-z0-9]{1,5})$/i.exec(filename ?? '')?.[1]
  if (ext) return ext.toUpperCase()
  const sub = /\/([a-z0-9.+-]+)$/i.exec(mimeType ?? '')?.[1]
  return sub ? sub.toUpperCase() : 'File'
}

/** Up to two initials for an avatar with no picture. */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').replace(/[^\p{L}\p{N}\s'-]/gu, ' ').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = Array.from(parts[0])[0] ?? '?'
  const last = parts.length > 1 ? (Array.from(parts[parts.length - 1])[0] ?? '') : ''
  return (first + last).toUpperCase()
}

/** Where the saving-state line says. Pure so the wording is tested. */
export function saveStateLabel(s: { processing: boolean; modified: boolean; lastSavedAt: number | null; now: number; isNew: boolean; docUpdatedAt?: number | null }): string {
  if (s.processing) return 'Saving...'
  if (s.modified) return 'Unsaved changes'
  if (s.isNew) return 'Not saved yet'
  // A save that reloads the page loses the in-memory time, so the record's own updated time (when recent) counts too.
  const recent = s.docUpdatedAt != null && Number.isFinite(s.docUpdatedAt) && s.now - s.docUpdatedAt > -5000 && s.now - s.docUpdatedAt < 3_600_000 ? s.docUpdatedAt : null
  const at = Math.max(s.lastSavedAt ?? -Infinity, recent ?? -Infinity)
  if (!Number.isFinite(at)) return 'All changes saved'
  const secs = Math.max(0, Math.round((s.now - at) / 1000))
  if (secs < 20) return 'Saved just now'
  if (secs < 3600) return `Saved ${Math.max(1, Math.round(secs / 60))} min ago`
  return 'All changes saved'
}

/** Collects the ids asked for in one tick and answers them with a single query, so a list of 50 rows costs one lookup, not 50. */
export function createBatchLoader<V>(fetchMany: (ids: number[]) => Promise<Map<number, V>>) {
  let pending: Map<number, Array<(v: V | undefined) => void>> | null = null
  const flush = async () => {
    const batch = pending!
    pending = null
    let found = new Map<number, V>()
    try {
      found = await fetchMany([...batch.keys()])
    } catch {
      // A failed lookup shows the plain fallback in every row rather than breaking the list.
    }
    for (const [id, waiters] of batch) for (const w of waiters) w(found.get(id))
  }
  return (id: number): Promise<V | undefined> =>
    new Promise((resolve) => {
      if (!pending) {
        pending = new Map()
        setTimeout(() => void flush(), 0)
      }
      const list = pending.get(id) ?? []
      list.push(resolve)
      pending.set(id, list)
    })
}

/** A media URL for the admin's own pages: a file served from the site's own address is made relative, so it still loads when the admin is opened on another host (a preview, a local port). Files on other hosts (Blob) are kept as they are. */
export function adminMediaSrc(url: string | null | undefined, serverURL?: string | null): string | null {
  if (!url) return null
  const base = (serverURL ?? '').replace(/\/+$/, '')
  return base && url.startsWith(`${base}/`) ? url.slice(base.length) : url
}
