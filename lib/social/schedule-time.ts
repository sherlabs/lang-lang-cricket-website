/**
 * Club time to a moment, and the quiet-hours window (wave C spec 4.2). Pure. `zonedToUtc` converts a wall-clock date and time in
 * an IANA zone to the UTC instant, correct across a daylight-saving change (the offset is read at the target instant, twice).
 */
const parts = (d: Date, tz: string) => {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const o: Record<string, string> = {}
  for (const p of f.formatToParts(d)) o[p.type] = p.value
  return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour, mi: +o.minute, s: +o.second }
}

/** Minutes the zone is ahead of UTC at instant `d`. */
function offsetMinutes(d: Date, tz: string): number {
  const p = parts(d, tz)
  return Math.round((Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(d.getTime() / 1000) * 1000) / 60_000)
}

export const isClubDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`))
export const isClubTime = (v: unknown): v is string => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)

/** Null for a bad date or time, or a wall-clock time that does not exist (skipped by a clock change). */
export function zonedToUtc(date: string, time: string, tz: string): Date | null {
  if (!isClubDate(date) || !isClubTime(time)) return null
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  const wall = Date.UTC(y, mo - 1, d, h, mi)
  let guess = wall - offsetMinutes(new Date(wall), tz) * 60_000
  guess = wall - offsetMinutes(new Date(guess), tz) * 60_000
  const out = new Date(guess)
  const back = parts(out, tz)
  // A time inside a spring-forward gap does not exist: it comes back as a different wall time.
  return back.y === y && back.mo === mo && back.d === d && back.h === h && back.mi === mi ? out : null
}

/** The date and time (club zone) of an instant, as the inputs show them. */
export function utcToClubParts(d: Date, tz: string): { date: string; time: string } {
  const p = parts(d, tz)
  const z = (n: number, w = 2) => String(n).padStart(w, '0')
  return { date: `${z(p.y, 4)}-${z(p.mo)}-${z(p.d)}`, time: `${z(p.h)}:${z(p.mi)}` }
}

export type PublishWindow = { earliest: string; latest: string }
export const DEFAULT_WINDOW: PublishWindow = { earliest: '07:00', latest: '21:00' }

export function resolveWindow(v: unknown): PublishWindow {
  const o = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>
  return { earliest: isClubTime(o.earliest) ? o.earliest : DEFAULT_WINDOW.earliest, latest: isClubTime(o.latest) ? o.latest : DEFAULT_WINDOW.latest }
}

/** Is a club-time `HH:MM` inside the window (earliest inclusive, latest inclusive)? A window that wraps midnight is understood. */
export function insideWindow(time: string, w: PublishWindow): boolean {
  if (w.earliest <= w.latest) return time >= w.earliest && time <= w.latest
  return time >= w.earliest || time <= w.latest
}

const clock = (t: string, locale = 'en-AU') => {
  const [h, m] = t.split(':').map(Number)
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: m ? '2-digit' : undefined, hour12: true, timeZone: 'UTC' }).format(new Date(Date.UTC(2000, 0, 1, h, m)))
}

/** The sentence beside the tick that allows a post outside quiet hours. */
export const quietHoursText = (w: PublishWindow, locale?: string): string =>
  `This is outside the club's usual posting hours (${clock(w.earliest, locale)} to ${clock(w.latest, locale)}), when most followers are asleep or may be annoyed by notifications. Post anyway.`

export type TimeCheck = { ok: true; at: Date; outside: boolean } | { ok: false; error: string }

/** The schedule time rules: a real time, in the future, and inside quiet hours unless the person ticked the box. */
export function checkScheduleTime(o: { date: unknown; time: unknown; tz: string; now: Date; window: PublishWindow; allowOutside: boolean }): TimeCheck {
  if (!isClubDate(o.date) || !isClubTime(o.time)) return { ok: false, error: 'Choose a date and time to post.' }
  const at = zonedToUtc(o.date, o.time, o.tz)
  if (!at) return { ok: false, error: 'That time does not exist on that day (the clocks change). Pick another.' }
  if (at.getTime() <= o.now.getTime()) return { ok: false, error: 'Choose a time in the future.' }
  const outside = !insideWindow(o.time, o.window)
  if (outside && !o.allowOutside) return { ok: false, error: 'That is outside the club\'s usual posting hours. Tick the box to post anyway.' }
  return { ok: true, at, outside }
}
