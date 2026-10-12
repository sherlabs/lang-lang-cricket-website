import { NETS } from './constants'

/** Validation for creating or editing a net session (wave B spec 4.2). Pure; rejects, never clamps. */
export type SessionInput = { title?: unknown; date?: unknown; startTime?: unknown; nets?: unknown; minutesPerTurn?: unknown; groupSize?: unknown; notes?: unknown }
export type SessionValues = { title: string; date: string; startTime: string | null; nets: number; minutesPerTurn: number; groupSize: number; notes: string | null }
export type SessionCheck = { ok: true; value: SessionValues } | { ok: false; error: string }

export const DEFAULT_TITLE = 'Net session'

const isRealDate = (s: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}
const int = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : typeof v === 'string' && /^\d{1,3}$/.test(v.trim()) ? Number(v.trim()) : null)
const plain = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '')

export function validateSession(input: SessionInput): SessionCheck {
  const date = typeof input.date === 'string' ? input.date.trim() : ''
  if (!isRealDate(date)) return { ok: false, error: 'Pick the date of the session.' }
  const startRaw = typeof input.startTime === 'string' ? input.startTime.trim() : ''
  if (startRaw && !/^([01]\d|2[0-3]):[0-5]\d$/.test(startRaw)) return { ok: false, error: 'The start time should look like 18:00.' }
  const L = NETS.limits
  const nets = input.nets === undefined || input.nets === '' ? NETS.defaults.nets : int(input.nets)
  const minutes = input.minutesPerTurn === undefined || input.minutesPerTurn === '' ? NETS.defaults.minutesPerTurn : int(input.minutesPerTurn)
  const group = input.groupSize === undefined || input.groupSize === '' ? NETS.defaults.groupSize : int(input.groupSize)
  if (nets == null || nets < L.nets.min || nets > L.nets.max) return { ok: false, error: `Nets must be from ${L.nets.min} to ${L.nets.max}.` }
  if (minutes == null || minutes < L.minutesPerTurn.min || minutes > L.minutesPerTurn.max) return { ok: false, error: `Minutes per turn must be from ${L.minutesPerTurn.min} to ${L.minutesPerTurn.max}.` }
  if (group == null || group < L.groupSize.min || group > L.groupSize.max) return { ok: false, error: `Players per net must be from ${L.groupSize.min} to ${L.groupSize.max}.` }
  return { ok: true, value: { title: plain(input.title, 80) || DEFAULT_TITLE, date, startTime: startRaw || null, nets, minutesPerTurn: minutes, groupSize: group, notes: plain(input.notes, 500) || null } }
}
