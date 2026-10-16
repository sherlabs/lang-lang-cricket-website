import type { NetState } from './constants'
import type { RotationPlan } from './rotation'

/** What the timer and the state route hand to the browser: stored timer state plus the server clock, to correct for skew. */
export type NetSnapshot = {
  id: number
  title: string
  date: string
  state: NetState
  nets: number
  minutesPerTurn: number
  groupSize: number
  round: number
  roundStartedAt: number | null
  pausedAt: number | null
  revision: number
  rounds: number
  plan: RotationPlan | null
  serverNow: number
}
