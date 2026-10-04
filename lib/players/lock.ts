/** The sync lock window, shared by the nightly sync and the match backfill script (pure: no Next or Payload imports). */
export const LOCK_MS = 10 * 60 * 1000

export function isLocked(latest: { status: string | null; startedAt: Date } | undefined, now: Date): boolean {
  return !!latest && latest.status === 'running' && now.getTime() - latest.startedAt.getTime() < LOCK_MS
}
