import type { Field } from 'payload'
import { nobodyField } from '../access'
import { internalCollection } from './internalCollection'

const code = { update: nobodyField } as const
/** The lease fields are never returned to anyone and never writable: only the publisher's SQL touches them. */
const lease = { read: nobodyField, create: nobodyField, update: nobodyField } as const

export const POST_STATUS_OPTIONS = ['draft', 'scheduled', 'publishing', 'published', 'failed'].map((value) => ({ label: value, value }))

/**
 * A social post in the scheduling queue (wave C spec 4.4). One row per post; one row per network lives in `social-post-targets`.
 * Hidden for every role: the committee reaches posts only through Social posts. Rows are written by the composer's server actions
 * (Local API with the access override, after a staff check) and by the publisher's explicit SQL; the publisher's claim, status and
 * lease fields are not writable by anyone over REST or the admin, and the lease fields are never readable.
 */
export const SocialPosts = internalCollection({
  slug: 'social-posts',
  singular: 'Social post',
  plural: 'Social posts (data)',
  description: 'Posts waiting to go to Facebook, Instagram or X. Managed from Social posts; read only here.',
  defaultColumns: ['title', 'status', 'scheduledFor'],
  fields: [
    { name: 'title', type: 'text', required: true, maxLength: 120 },
    { name: 'status', type: 'select', required: true, defaultValue: 'draft', options: POST_STATUS_OPTIONS, index: true, access: code },
    { name: 'spec', type: 'json', required: true },
    { name: 'caption', type: 'textarea', maxLength: 5000 },
    { name: 'hashtags', type: 'json' },
    { name: 'scheduledFor', type: 'date' },
    { name: 'nextRunAt', type: 'date', index: true, access: code },
    { name: 'approvedBy', type: 'relationship', relationTo: 'users', access: code },
    { name: 'approvedAt', type: 'date', access: code },
    { name: 'createdBy', type: 'relationship', relationTo: 'users', access: code },
    { name: 'claimToken', type: 'text', access: lease },
    { name: 'claimedAt', type: 'date', access: lease },
    { name: 'finishedAt', type: 'date', access: code },
    { name: 'revision', type: 'number', required: true, defaultValue: 1, access: code },
  ] satisfies Field[],
})
