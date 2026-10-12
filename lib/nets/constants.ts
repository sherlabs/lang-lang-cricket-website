/**
 * Net sessions (wave B spec 4.2): the defaults a new session starts with and the caps around guests. These are rules of the tool,
 * not club values; a club changes a session's own numbers when it creates one.
 */
export const NETS = {
  defaults: { nets: 3, minutesPerTurn: 10, groupSize: 4 },
  limits: { nets: { min: 1, max: 12 }, minutesPerTurn: { min: 1, max: 30 }, groupSize: { min: 2, max: 8 } },
  guestNameMax: 40,
  guestsPerSession: 10,
  /** The player card counts "turned up" over this many weeks. */
  cardWindowWeeks: 8,
  /** The card's dot row shows at most this many recent sessions. */
  cardDots: 8,
} as const

export const NET_STATES = ['planned', 'running', 'paused', 'finished'] as const
export type NetState = (typeof NET_STATES)[number]
