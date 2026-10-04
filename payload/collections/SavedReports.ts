import { APIError, type CollectionBeforeChangeHook, type CollectionBeforeValidateHook, type CollectionConfig } from 'payload'
import { MAX_QUERY_LENGTH, MAX_SAVED_REPORTS, canonicaliseReport } from '../../lib/stats/saved-reports'
import { isAdmin, nobodyField } from '../access'
import { hiddenFromEditors } from '../admin/visibility'
import { maxChars } from '../fields/validators'
import { uniqueSlug } from '../hooks/slug'
import { trimStrings } from '../hooks/trimStrings'

/** Hook-owned: read-only in the admin AND unwritable over REST (spec §2: `admin.readOnly` is UI only). */
const hookOwned = { create: nobodyField, update: nobodyField }

/**
 * Replaces the stored string with its canonical StatLab form and refuses anything that is not a
 * report (W2 spec 5.3). Skipped for an update that does not touch `query`.
 */
const canonicaliseQuery: CollectionBeforeValidateHook = async ({ data, operation, req }) => {
  if (!data) return data
  if (operation === 'update' && data.query === undefined) return data
  const res = canonicaliseReport(typeof data.query === 'string' ? data.query : '')
  if (!res.ok) throw new APIError(res.reason, 400, undefined, true)
  data.query = res.query
  if (operation === 'create') {
    const { totalDocs } = await req.payload.count({ collection: 'saved-reports', overrideAccess: true, req })
    if (totalDocs >= MAX_SAVED_REPORTS) throw new APIError(`There is room for ${MAX_SAVED_REPORTS} saved reports. Delete one you no longer use first.`, 400, undefined, true)
  }
  return data
}

/** The owner is whoever created the report; nothing else sets it. */
const stampOwner: CollectionBeforeChangeHook = ({ data, operation, req }) => {
  if (operation === 'create' && req.user) data.owner = req.user.id
  return data
}

/**
 * Saved StatLab reports (W2 spec 5.3): a small admin bookmark list of canonical StatLab query strings.
 * Presets and canonical URLs already make reports shareable, so there is no public list, route or card.
 */
export const SavedReports: CollectionConfig = {
  slug: 'saved-reports',
  labels: { singular: 'Saved report', plural: 'Saved reports' },
  admin: {
    group: false,
    hideAPIURL: true,
    hidden: hiddenFromEditors,
    useAsTitle: 'title',
    defaultColumns: ['title', 'query', 'updatedAt'],
    description: 'Bookmarks of StatLab tables. Open StatLab, build a table, then use "Save this report" under the table. The link of a saved report is the page address, so it can be shared.',
  },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  hooks: { beforeValidate: [trimStrings(['title', 'query', 'description']), canonicaliseQuery], beforeChange: [stampOwner] },
  timestamps: true,
  fields: [
    { name: 'title', type: 'text', required: true, validate: maxChars(80, { required: true }), admin: { description: 'For example "Fifty makers, one day games".' } },
    { name: 'slug', type: 'text', unique: true, index: true, access: hookOwned, admin: { readOnly: true, position: 'sidebar' }, hooks: { beforeChange: [uniqueSlug('saved-reports')] } },
    {
      name: 'owner', type: 'relationship', relationTo: 'users', access: hookOwned,
      admin: { readOnly: true, position: 'sidebar', description: 'Who saved it.' },
    },
    {
      name: 'query', type: 'text', required: true, maxLength: MAX_QUERY_LENGTH,
      admin: { description: 'The StatLab query string, tidied up on save. Normally filled in by "Save this report".' },
    },
    { name: 'description', type: 'textarea', validate: maxChars(300), admin: { description: 'Optional note about what the report shows.' } },
  ],
}
