import { cache } from 'react'

/** Per-request scratchpad shared by the admin layout and the view: the layout records how long the theme took. */
export const requestTimings = cache((): { themeMs?: number } => ({}))

export type RenderLog = { route: string; authMs: number; themeMs: number | null; viewMs: number; session: 'staff' | 'not-staff' | 'signed-out' | 'retried-ok' | 'error' }

/** One structured line per admin render. Route name only (never the query string), no names, emails or ids. */
export function renderLogLine(log: RenderLog): string {
  return JSON.stringify({ evt: 'admin.render', ...log })
}
