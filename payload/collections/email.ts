import { ValidationError, type CollectionConfig, type Field } from 'payload'
import { isAdminUser, isAdmin, nobody } from '../access'
import { hiddenFromEditors } from '../admin/visibility'
import { audienceJson, parseAudience } from '../../lib/email/audience'
import { templateProblem } from '../../lib/email/merge'
import { adminFields, serverOwnedAccess } from './officeAccess'

/**
 * Bulk email (wave D spec 9.2). Three admin-only collections. Campaigns are edited only while they are drafts; recipients and
 * suppressions are written by server code after its own admin check (never over REST), because they carry personal data and the
 * unsubscribe promise. Every field declares its access (`tests/office-field-access.test.ts`).
 */
const adminWhenDraft = ({ req }: { req: { user?: unknown } }) => (isAdminUser(req.user as never) ? { status: { equals: 'draft' } } : false)

export const CAMPAIGN_STATUSES = ['draft', 'sending', 'sent', 'cancelled'] as const
export const RECIPIENT_STATUSES = ['queued', 'sending', 'sent', 'failed', 'skipped-suppressed', 'skipped-no-email'] as const
export const SUPPRESSION_REASONS = ['unsubscribed', 'manual', 'bounced', 'complaint'] as const

const options = <T extends string>(values: readonly T[], labels: Record<string, string> = {}) => values.map((value) => ({ label: labels[value] ?? value, value }))

export const EmailCampaigns: CollectionConfig = {
  slug: 'email-campaigns',
  labels: { singular: 'Email', plural: 'Emails' },
  admin: {
    group: false,
    hideAPIURL: true,
    hidden: hiddenFromEditors,
    useAsTitle: 'subject',
    defaultColumns: ['subject', 'status', 'sentAt'],
    description: 'Emails to members. Write and send them from Club office, then Email. Only admins can see this, and only when email is switched on for the site.',
  },
  defaultSort: '-createdAt',
  disableDuplicate: true,
  // Once sending starts a campaign is never edited or deleted: the record of what went out stays.
  access: { read: isAdmin, create: isAdmin, update: adminWhenDraft, delete: adminWhenDraft },
  timestamps: true,
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (!data) return data
        const out = { ...data } as Record<string, unknown>
        if ('audience' in out) out.audience = audienceJson(parseAudience(out.audience))
        if (typeof out.subject === 'string') out.subject = out.subject.replace(/\s+/g, ' ').trim()
        return out
      },
    ],
    beforeChange: [
      ({ data, operation, req }) => {
        for (const path of ['subject', 'body'] as const) {
          const value = (data as Record<string, unknown>)[path]
          const problem = typeof value === 'string' ? templateProblem(value) : null
          if (problem) throw new ValidationError({ errors: [{ path, message: problem }] })
        }
        if (operation === 'create' && req.user && isAdminUser(req.user as never)) (data as Record<string, unknown>).createdBy = (req.user as { id: number }).id
        return data
      },
    ],
  },
  fields: adminFields([
    { name: 'subject', label: 'Subject', type: 'text', required: true, maxLength: 150, admin: { description: 'Shown as the email’s subject line.' } },
    { name: 'body', label: 'Message', type: 'textarea', required: true, maxLength: 20000, admin: { description: 'Plain text. A blank line starts a new paragraph. You can use {firstName}, {firstName|there}, {clubName} and {volunteerLink}.' } },
    { name: 'audience', label: 'Who it goes to', type: 'json', admin: { description: 'Set from the Email page. Holds the filter only, never names or addresses.' } },
    { name: 'status', label: 'Status', type: 'select', required: true, defaultValue: 'draft', index: true, options: options(CAMPAIGN_STATUSES, { draft: 'Draft', sending: 'Sending', sent: 'Sent', cancelled: 'Stopped' }), access: serverOwnedAccess },
    {
      name: 'counts',
      label: 'Progress',
      type: 'group',
      access: serverOwnedAccess,
      fields: ['queued', 'sent', 'failed', 'skipped'].map((name) => ({ name, type: 'number' as const, defaultValue: 0, access: serverOwnedAccess })) as Field[],
    },
    { name: 'createdBy', label: 'Written by', type: 'relationship', relationTo: 'users', access: serverOwnedAccess },
    { name: 'sentAt', label: 'Finished', type: 'date', access: serverOwnedAccess, admin: { date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'recipientsPurgedAt', label: 'Addresses removed on', type: 'date', access: serverOwnedAccess, admin: { date: { pickerAppearance: 'dayAndTime' }, description: 'The addresses and first names kept for this email are removed after the retention period set in Club office settings.' } },
  ]),
}

/** One row per address per campaign. Personal data: blanked after the retention period, scrubbed when a member's details are removed. */
export const EmailRecipients: CollectionConfig = {
  slug: 'email-recipients',
  labels: { singular: 'Email recipient', plural: 'Email recipients' },
  admin: { group: false, hideAPIURL: true, hidden: hiddenFromEditors, defaultColumns: ['campaign', 'status', 'attempts'], description: 'Who an email was sent to. Written by the system only; addresses are removed after the retention period.' },
  disableDuplicate: true,
  access: { read: isAdmin, create: nobody, update: nobody, delete: nobody },
  // The same address gets one copy of a campaign.
  indexes: [{ fields: ['campaign', 'email'], unique: true }],
  timestamps: true,
  fields: adminFields([
    { name: 'campaign', type: 'relationship', relationTo: 'email-campaigns', required: true, index: true, access: serverOwnedAccess },
    { name: 'member', type: 'relationship', relationTo: 'members', index: true, access: serverOwnedAccess },
    { name: 'email', type: 'text', access: serverOwnedAccess },
    { name: 'emailHash', type: 'text', required: true, index: true, access: serverOwnedAccess },
    { name: 'firstName', type: 'text', access: serverOwnedAccess },
    { name: 'status', type: 'select', required: true, defaultValue: 'queued', index: true, options: options(RECIPIENT_STATUSES), access: serverOwnedAccess },
    { name: 'attempts', type: 'number', defaultValue: 0, access: serverOwnedAccess },
    { name: 'claimToken', type: 'text', access: serverOwnedAccess },
    { name: 'claimedAt', type: 'date', access: serverOwnedAccess },
    { name: 'nextAttemptAt', type: 'date', access: serverOwnedAccess },
    { name: 'providerId', type: 'text', access: serverOwnedAccess },
    { name: 'error', type: 'text', access: serverOwnedAccess },
  ]),
}

/** Addresses that must never get a campaign. Keyed by the address hash, not the member, so it survives deleting or erasing a member. */
export const EmailSuppressions: CollectionConfig = {
  slug: 'email-suppressions',
  labels: { singular: 'Unsubscribed address', plural: 'Unsubscribed addresses' },
  admin: { group: false, hideAPIURL: true, hidden: hiddenFromEditors, useAsTitle: 'email', defaultColumns: ['email', 'reason', 'at'], description: 'People who asked not to get club emails, and addresses that bounced. Manage them from Club office, then Email.' },
  defaultSort: '-at',
  disableDuplicate: true,
  access: { read: isAdmin, create: nobody, update: nobody, delete: nobody },
  timestamps: true,
  fields: adminFields([
    { name: 'emailHash', type: 'text', required: true, unique: true, index: true, access: serverOwnedAccess },
    { name: 'email', type: 'text', access: serverOwnedAccess, admin: { description: 'Empty when the address was removed from the sending record.' } },
    { name: 'reason', type: 'select', required: true, options: options(SUPPRESSION_REASONS, { unsubscribed: 'Unsubscribed', manual: 'Added by an admin', bounced: 'Bounced', complaint: 'Complaint' }), access: serverOwnedAccess },
    { name: 'source', type: 'text', access: serverOwnedAccess },
    { name: 'at', type: 'date', required: true, access: serverOwnedAccess, admin: { date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'campaign', type: 'relationship', relationTo: 'email-campaigns', access: serverOwnedAccess },
  ]),
}

