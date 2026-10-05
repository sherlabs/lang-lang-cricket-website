import type { GlobalConfig } from 'payload'
import { isAdmin, isSelection } from '../access'
import { hiddenFromEditors } from '../admin/visibility'

/**
 * Settings for the selector tools (announce-teams spec 4.5). `linkVersion` is the availability link: rotating it (the selector
 * area's "Rotate link" button adds one) instantly invalidates the old link, every remembered device and every lock key. The
 * link itself is derived from it and never stored. Readable by selection users; changed here by an admin or from the selector
 * area by an action that checks the caller's role.
 */
export const SelectionSettings: GlobalConfig = {
  slug: 'selection-settings',
  label: 'Selection settings',
  admin: { group: false, hidden: hiddenFromEditors, description: 'The availability link and selection options. Selectors change the link from the selector area.' },
  access: { read: isSelection, update: isAdmin },
  fields: [
    { name: 'linkEnabled', type: 'checkbox', defaultValue: true, label: 'Availability link is switched on', admin: { description: 'Untick to turn the link off: everyone who opens it sees a "page not found".' } },
    { name: 'linkVersion', type: 'number', defaultValue: 1, min: 1, required: true, label: 'Link version', admin: { description: 'Add one to give everyone a new link. The old link, and every remembered phone, stops working at once.' } },
    { name: 'availabilityLockHours', type: 'number', defaultValue: 0, min: 0, label: 'Close availability this many hours before a game', admin: { description: '0 keeps availability open until the game. After it closes, players see "Selection has started; call a selector".' } },
    {
      name: 'defaultXiSize',
      type: 'number',
      defaultValue: 11,
      min: 0,
      max: 13,
      validate: (v: number | null | undefined) => (v == null || [0, 11, 12, 13].includes(v) ? true : 'Use 11, 12 or 13, or 0 for no limit.'),
      label: 'Players in a team (new teams)',
      admin: { description: '11, 12 or 13. A selector can change it for one game. 0 means no limit.' },
    },
    { name: 'publishBattingOrder', type: 'checkbox', defaultValue: true, label: 'Show the batting order on the public teams page', admin: { description: 'Untick to list the team alphabetically without numbers (captain and keeper stay marked).' } },
    { name: 'announceOnPublish', type: 'checkbox', defaultValue: true, label: 'Post a site announcement when teams are published', admin: { description: 'Adds one announcement per weekend (updated if the teams change) that links to the teams page.' } },
  ],
}
