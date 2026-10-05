import { APIError, type CollectionBeforeChangeHook } from 'payload'
import { isSelectionUser } from '../access'
import { isXiSize } from '../../lib/selection/team-sheet'
import { codeOnlyAccess, selectionCollection } from './selectionCollection'

/**
 * Who last saved a sheet is never taken from the request. `revision` is claimed atomically by the save function
 * (`lib/selector-team-queries.ts`, a conditional UPDATE), so a stale save is refused before it reaches this hook.
 */
const deriveUpdater: CollectionBeforeChangeHook = ({ data, req }) => {
  data.updatedBy = isSelectionUser(req.user) ? req.user!.id : null
  return data
}

const sizeIsAllowed = (v: unknown): true | string => (v == null || isXiSize(v) ? true : 'A team has 11, 12 or 13 players, or 0 for no limit.')

/** Raised by the save function when `expectedRevision` is stale (409), so the selector sees why nothing was saved. */
export const staleSheetError = () => new APIError('Someone else changed this team. Reload to see their changes.', 409, null, true)

/**
 * One team sheet per fixture (announce-teams spec 5.1): the batting order a selector builds, its size and "ready" mark, private
 * notes and, once published, a frozen snapshot of what the public sees. Managed in the selector area; over REST only admins and
 * editors can read or write it, and the publish fields (`publishedSnapshot`, `publishedAt`, `publishedBy`, `publishCount`,
 * `announcementId`) are written by the publish action alone.
 */
export const TeamSheets = selectionCollection({
  slug: 'team-sheets',
  singular: 'Team sheet',
  plural: 'Team sheets',
  description: 'The team picked for one game. Managed in the selector area.',
  defaultColumns: ['fixture', 'size', 'markedReady', 'publishedAt'],
  hooks: { beforeChange: [deriveUpdater] },
  fields: [
    { name: 'fixture', type: 'relationship', relationTo: 'selection-fixtures', required: true, unique: true, index: true },
    {
      name: 'slots',
      type: 'array',
      labels: { singular: 'Place', plural: 'Places' },
      fields: [
        { name: 'player', type: 'relationship', relationTo: 'players' },
        { name: 'guestName', type: 'text', maxLength: 40 },
        { name: 'order', type: 'number', required: true, min: 1 },
        { name: 'isCaptain', type: 'checkbox', defaultValue: false },
        { name: 'isKeeper', type: 'checkbox', defaultValue: false },
      ],
    },
    { name: 'size', type: 'number', defaultValue: 11, validate: sizeIsAllowed, admin: { description: '11, 12 or 13 players, or 0 for no limit.' } },
    { name: 'markedReady', type: 'checkbox', defaultValue: false },
    { name: 'notes', type: 'textarea', maxLength: 1000, admin: { description: 'Private to selectors.' } },
    { name: 'revision', type: 'number', defaultValue: 0, access: { create: () => false, update: () => false } },
    { name: 'updatedBy', type: 'relationship', relationTo: 'users', access: { create: () => false, update: () => false } },
    { name: 'publishedSnapshot', type: 'json', hidden: true, access: codeOnlyAccess },
    { name: 'publishedAt', type: 'date', access: { create: () => false, update: () => false } },
    { name: 'publishedBy', type: 'relationship', relationTo: 'users', access: { create: () => false, update: () => false } },
    { name: 'publishCount', type: 'number', defaultValue: 0, access: { create: () => false, update: () => false } },
    { name: 'announcementId', type: 'number', access: { create: () => false, update: () => false } },
  ],
})
