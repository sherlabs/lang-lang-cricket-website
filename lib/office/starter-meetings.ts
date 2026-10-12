import type { ItemKind, MeetingKind } from './meetings'

/**
 * Generic starter agendas for "Add the standard agendas" (wave D spec 6.1). Neutral wording only: a region's own legal wording is
 * added by the club in the template editor. Re-running the action adds only the names that are missing.
 */
export type StarterTemplate = { name: string; kind: MeetingKind; items: { title: string; kind: ItemKind; defaultNotes?: string; restricted?: boolean }[] }

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    name: 'Committee meeting',
    kind: 'ordinary',
    items: [
      { title: 'Welcome and apologies', kind: 'welcome' },
      { title: 'Approve the previous minutes', kind: 'minutes' },
      { title: 'Business arising from the minutes', kind: 'business', defaultNotes: 'Open actions from earlier meetings are listed here.' },
      { title: 'Reports', kind: 'report' },
      { title: 'Finance', kind: 'financial' },
      { title: 'General business', kind: 'general' },
      { title: 'Next meeting and close', kind: 'close' },
    ],
  },
  {
    name: 'Yearly general meeting',
    kind: 'annual',
    items: [
      { title: 'Welcome and apologies', kind: 'welcome' },
      { title: 'Approve the previous minutes', kind: 'minutes' },
      { title: 'Business arising from the minutes', kind: 'business', defaultNotes: 'Open actions from earlier meetings are listed here.' },
      { title: 'Reports', kind: 'report' },
      { title: 'Financial statements', kind: 'financial' },
      { title: 'Election of office bearers', kind: 'election', defaultNotes: 'Use "Hand over seats" on this meeting once the result is known.' },
      { title: 'General business', kind: 'general' },
      { title: 'Close', kind: 'close' },
    ],
  },
  {
    name: 'Special meeting',
    kind: 'special',
    items: [
      { title: 'Welcome and apologies', kind: 'welcome' },
      { title: 'Purpose of the meeting', kind: 'general' },
      { title: 'Discussion and decision', kind: 'general' },
      { title: 'Close', kind: 'close' },
    ],
  },
]
