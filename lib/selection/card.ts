/**
 * The player card's editable fields (wave B spec 4.6). An allowlist: an unknown option is rejected, never coerced to something near it.
 */
export const CARD_ROLES = ['batter', 'bowler', 'all-rounder', 'keeper'] as const
export const BATTING_STYLES = ['right-hand', 'left-hand'] as const
export const BOWLING_STYLES = ['none', 'right-arm fast', 'right-arm medium', 'right-arm off-break', 'right-arm leg-break', 'left-arm fast', 'left-arm medium', 'left-arm orthodox', 'left-arm wrist spin'] as const
export const NOTES_MAX = 1000

export type CardRole = (typeof CARD_ROLES)[number]
export type BattingStyle = (typeof BATTING_STYLES)[number]
export type BowlingStyle = (typeof BOWLING_STYLES)[number]

export const BATTING_STYLE_LABEL: Record<BattingStyle, string> = { 'right-hand': 'Right-hand bat', 'left-hand': 'Left-hand bat' }
export const BOWLING_STYLE_LABEL: Record<BowlingStyle, string> = {
  none: 'Does not bowl',
  'right-arm fast': 'Right-arm fast',
  'right-arm medium': 'Right-arm medium',
  'right-arm off-break': 'Right-arm off-break',
  'right-arm leg-break': 'Right-arm leg-break',
  'left-arm fast': 'Left-arm fast',
  'left-arm medium': 'Left-arm medium',
  'left-arm orthodox': 'Left-arm orthodox',
  'left-arm wrist spin': 'Left-arm wrist spin',
}

/** What a card form may send. A key left out (undefined) means "do not change it". */
export type CardInput = { role?: unknown; canKeep?: unknown; battingStyle?: unknown; bowlingStyle?: unknown; notes?: unknown; notesStaffOnly?: unknown }
export type CardPatch = { role?: CardRole | null; canKeep?: boolean; battingStyle?: BattingStyle | null; bowlingStyle?: BowlingStyle | null; notes?: string | null; notesStaffOnly?: boolean }
export type CardCheck = { ok: true; patch: CardPatch } | { ok: false; error: string }

const oneOf = <T extends string>(list: readonly T[], v: unknown): T | null => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : null)
const isEmpty = (v: unknown) => v === null || v === '' || v === false
const truthy = (v: unknown) => v === true || v === 'on' || v === 'true'

/** Control characters other than a newline are removed from a note; it is plain text. */
const cleanNote = (s: string) => s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').trim()

export function validateCard(input: CardInput): CardCheck {
  const patch: CardPatch = {}
  if (input.role !== undefined) {
    if (isEmpty(input.role)) patch.role = null
    else {
      const role = oneOf(CARD_ROLES, input.role)
      if (!role) return { ok: false, error: 'Pick a role from the list.' }
      patch.role = role
    }
  }
  if (input.canKeep !== undefined) patch.canKeep = truthy(input.canKeep)
  if (input.battingStyle !== undefined) {
    if (isEmpty(input.battingStyle)) patch.battingStyle = null
    else {
      const v = oneOf(BATTING_STYLES, input.battingStyle)
      if (!v) return { ok: false, error: 'Pick a batting style from the list.' }
      patch.battingStyle = v
    }
  }
  if (input.bowlingStyle !== undefined) {
    if (isEmpty(input.bowlingStyle)) patch.bowlingStyle = null
    else {
      const v = oneOf(BOWLING_STYLES, input.bowlingStyle)
      if (!v) return { ok: false, error: 'Pick a bowling style from the list.' }
      patch.bowlingStyle = v
    }
  }
  if (input.notes !== undefined) {
    if (input.notes !== null && typeof input.notes !== 'string') return { ok: false, error: 'Notes must be plain text.' }
    const notes = cleanNote(input.notes ?? '')
    if (notes.length > NOTES_MAX) return { ok: false, error: `Notes can be up to ${NOTES_MAX} characters.` }
    patch.notes = notes || null
  }
  if (input.notesStaffOnly !== undefined) patch.notesStaffOnly = truthy(input.notesStaffOnly)
  return { ok: true, patch }
}
