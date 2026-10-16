import type { GraphicType } from './types'

/** The public page a caption's `{link}` points at: the club's own site, a path, nothing else. */
export function linkPath(type: GraphicType, params: unknown): string {
  const p = (params ?? {}) as Record<string, unknown>
  switch (type) {
    case 'lineup':
      return typeof p.gameId === 'string' ? `/teams/${p.gameId}` : '/teams'
    case 'event-promo':
      return typeof p.eventId === 'number' ? `/events/${p.eventId}` : '/events'
    case 'season-wrap':
      return typeof p.slug === 'string' ? `/yearbooks/${p.slug}` : '/yearbooks'
    case 'fixtures':
      return '/fixtures'
    case 'sponsor-thanks':
      return '/sponsors'
    case 'milestone':
    case 'stats-leaders':
      return '/stats'
    default:
      return '/matches'
  }
}
