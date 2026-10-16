import type { Field } from 'payload'
import { nobodyField } from '../access'
import { internalCollection } from './internalCollection'

const code = { update: nobodyField } as const

/**
 * One network a post goes to (wave C spec 4.4). A collection rather than an array on the post, because the publisher moves one
 * target at a time and a Payload array is rewritten wholesale on every update. Every field is written by code only.
 */
export const SocialPostTargets = internalCollection({
  slug: 'social-post-targets',
  singular: 'Social post network',
  plural: 'Social post networks (data)',
  description: 'One network a social post goes to, with its words and result. Managed from Social posts; read only here.',
  defaultColumns: ['post', 'network', 'status'],
  fields: [
    { name: 'post', type: 'relationship', relationTo: 'social-posts', required: true, access: code },
    { name: 'network', type: 'select', required: true, options: ['facebook', 'instagram', 'x', 'mock'].map((value) => ({ label: value, value })), access: code },
    { name: 'size', type: 'select', required: true, options: ['square', 'story', 'landscape'].map((value) => ({ label: value, value })), access: code },
    { name: 'finalText', type: 'textarea', access: code },
    { name: 'status', type: 'select', required: true, defaultValue: 'pending', options: ['pending', 'publishing', 'published', 'failed', 'unknown'].map((value) => ({ label: value, value })), access: code },
    { name: 'attempts', type: 'number', required: true, defaultValue: 0, access: code },
    { name: 'nextAttemptAt', type: 'date', access: code },
    { name: 'lastError', type: 'text', maxLength: 300, access: code },
    { name: 'errorCode', type: 'text', maxLength: 40, access: code },
    { name: 'remoteId', type: 'text', access: code },
    { name: 'remoteUrl', type: 'text', access: code },
    { name: 'publishedAt', type: 'date', access: code },
    { name: 'manual', type: 'checkbox', defaultValue: false, access: code },
  ] satisfies Field[],
})
