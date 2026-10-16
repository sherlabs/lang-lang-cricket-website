import type { GraphicType } from './types'

/** The icon each kind of post wears on its card in the composer (keys of the admin icon registry, `payload/components/ui/icons.ts`). */
export const TYPE_ICONS: Record<GraphicType, 'trophy' | 'events' | 'selectors' | 'medal' | 'star' | 'chart' | 'ticket' | 'sponsors' | 'crown' | 'players'> = {
  result: 'trophy',
  fixtures: 'events',
  lineup: 'selectors',
  potm: 'medal',
  milestone: 'star',
  'stats-leaders': 'chart',
  'event-promo': 'ticket',
  'sponsor-thanks': 'sponsors',
  'season-wrap': 'crown',
  toss: 'players',
}
