import type { Payload } from 'payload'
import { resetPlayers } from './players-helpers'

/** Empties the match store and the players tables it links to (`resetPlayers` truncates both). */
export async function resetMatches(payload: Payload): Promise<void> {
  await resetPlayers(payload)
}
