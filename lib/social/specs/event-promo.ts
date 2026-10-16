import type { Block, GraphicSpec } from '../types'
import { cleanText } from '../types'
import { isNumericId } from './helpers'

export type EventPromoData = { title: string; dateLabel: string; timeLabel: string; place: string; cover: string | null }
export type EventPromoParams = { eventId: number; text: string }

export const eventPromoSpec: GraphicSpec<EventPromoParams, EventPromoData> = {
  type: 'event-promo',
  label: 'Event promo',
  hint: 'An upcoming event, with its cover picture if it has one.',
  parse(raw) {
    return isNumericId(raw.source) ? { eventId: Number(raw.source), text: cleanText(raw.text) } : null
  },
  layout(d) {
    const when = [d.dateLabel, d.timeLabel].filter(Boolean).join('  |  ')
    const blocks: Block[] = [
      { kind: 'kicker', text: 'Coming up' },
      { kind: 'photo', src: d.cover, title: d.title, lines: [when, d.place].filter(Boolean) },
    ]
    return { blocks }
  },
  captionVars: (d) => ({ event: d.title, date: d.dateLabel, time: d.timeLabel, place: d.place }),
  describe: (d) => `Event: ${d.title}, ${d.dateLabel}`,
}
