import type { Field, GlobalConfig } from 'payload'
import { isAdminField, isStaff, isStaffField, nobodyField } from '../access'
import { hiddenFromEditors } from '../admin/visibility'
import { DEFAULT_CAPTIONS } from '../../lib/social/caption'
import { ATTRIBUTION_MAX, DEFAULT_STRIP_TIERS, HASHTAG_MAX, SPONSOR_STRIP_MAX, templateKey, validateHashtag, validateTemplate } from '../../lib/social/settings'
import { STYLE_KEYS, STYLE_LABELS, TYPE_KEYS } from '../../lib/social/types'
import { VOTES } from '../../config/site'
import { TIER_ORDER } from '../../lib/sponsors'

const TYPE_LABELS: Record<(typeof TYPE_KEYS)[number], string> = {
  result: 'Results',
  fixtures: 'Weekend preview',
  lineup: 'Team announcement',
  potm: VOTES.label,
  milestone: 'Milestone',
  'stats-leaders': 'Season leaders',
  'event-promo': 'Event promo',
  'sponsor-thanks': 'Sponsor thank-you',
  'season-wrap': 'Season wrap',
}

const validateClock = (v: unknown): true | string => (v == null || v === '' || (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)) ? true : 'Use 24-hour time like 07:00.')

const templateFields: Field[] = TYPE_KEYS.map((type) => ({
  name: templateKey(type),
  label: TYPE_LABELS[type],
  type: 'textarea' as const,
  maxLength: 600,
  // No stored default: an empty box means the standard wording, so the database holds only what the club typed.
  admin: { placeholder: DEFAULT_CAPTIONS[type], description: 'Leave empty to use the standard wording shown here.' },
  validate: validateTemplate,
}))

/**
 * Social graphics settings (wave C spec 3.3). The global admits staff (editors write the caption fields from the composer's
 * "Captions and hashtags" panel); the styling and policy fields are admin-only per field, because field access can only narrow the
 * global's. Nothing here is club-specific: hashtags and captions default to empty and generic English, and a club saves its own voice.
 */
export const SocialSettings: GlobalConfig = {
  slug: 'social-settings',
  label: 'Social graphics settings',
  admin: {
    group: false,
    hidden: hiddenFromEditors,
    description: 'How the pictures for Facebook, Instagram and X look, and the words that go with them. The committee changes the captions and hashtags from Social posts.',
  },
  access: { read: isStaff, update: isStaff },
  fields: [
    {
      type: 'collapsible',
      label: 'Look (admins only)',
      admin: { initCollapsed: false },
      fields: [
        {
          name: 'defaultStyle',
          label: 'Picture style',
          type: 'select',
          defaultValue: 'bold',
          options: STYLE_KEYS.map((value) => ({ label: STYLE_LABELS[value], value })),
          access: { update: isAdminField },
          admin: { description: 'Bold: your main colour, big type. Classic: a light card with a coloured band. Minimal: plain and airy. A post can pick a different one.' },
        },
        {
          name: 'sponsorStrip',
          label: 'Sponsor logos on pictures',
          type: 'group',
          access: { update: isAdminField },
          fields: [
            { name: 'show', label: 'Show sponsor logos along the bottom', type: 'checkbox', defaultValue: true },
            {
              name: 'tiers',
              label: 'Sponsor levels shown',
              type: 'select',
              hasMany: true,
              options: [...TIER_ORDER],
              defaultValue: [...DEFAULT_STRIP_TIERS],
              admin: { description: 'Logos must be PNG or JPG to appear on pictures.' },
            },
            { name: 'max', label: 'Most logos shown', type: 'number', min: SPONSOR_STRIP_MAX.min, max: SPONSOR_STRIP_MAX.max, defaultValue: SPONSOR_STRIP_MAX.default },
          ],
        },
        { name: 'showSiteHost', label: 'Show the website address on pictures', type: 'checkbox', defaultValue: true, access: { update: isAdminField } },
        {
          name: 'publishWindow',
          label: 'Usual posting hours',
          type: 'group',
          access: { update: isAdminField },
          admin: { description: 'In club time. A post scheduled outside these hours needs an extra tick, because followers may be asleep.' },
          fields: [
            { name: 'earliest', label: 'Earliest', type: 'text', defaultValue: '07:00', validate: validateClock, admin: { description: '24-hour time, for example 07:00.' } },
            { name: 'latest', label: 'Latest', type: 'text', defaultValue: '21:00', validate: validateClock, admin: { description: '24-hour time, for example 21:00.' } },
          ],
        },
        { name: 'attribution', label: 'Small line under the footer', type: 'text', maxLength: ATTRIBUTION_MAX, access: { update: isAdminField }, admin: { description: 'Optional. Leave empty for none.' } },
      ],
    },
    {
      type: 'collapsible',
      label: 'Captions and hashtags',
      admin: { initCollapsed: false },
      fields: [
        {
          name: 'hashtags',
          label: 'Hashtags',
          type: 'array',
          maxRows: HASHTAG_MAX,
          labels: { singular: 'Hashtag', plural: 'Hashtags' },
          access: { update: isStaffField },
          admin: { description: 'Without the # sign. Used on posts, and can be removed per post.' },
          fields: [{ name: 'tag', label: 'Hashtag', type: 'text', required: true, validate: validateHashtag, maxLength: 40 }],
        },
        {
          name: 'captionTemplates',
          label: 'Caption wording',
          type: 'group',
          access: { update: isStaffField },
          admin: { description: 'Words in curly brackets, such as {club} or {opponent}, are filled in from the game. A line with a missing value is left out.' },
          fields: templateFields,
        },
        { name: 'signOff', label: 'Sign-off line', type: 'text', maxLength: 200, access: { update: isStaffField }, admin: { description: 'Optional. Added to the end of every caption.' } },
      ],
    },
    {
      // Written only by the scheduler's check-in (explicit SQL), never by a person: it is how the queue can say when it last ran.
      type: 'collapsible',
      label: 'Scheduler check-in (automatic)',
      admin: { initCollapsed: true, description: 'When the scheduler last looked for posts to send. Filled in by the site.' },
      fields: [
        { name: 'lastCronRunAt', label: 'Last checked', type: 'date', access: { read: isStaffField, create: nobodyField, update: nobodyField }, admin: { readOnly: true } },
        { name: 'observedCronIntervalMinutes', label: 'Minutes between checks', type: 'number', access: { read: isStaffField, create: nobodyField, update: nobodyField }, admin: { readOnly: true } },
      ],
    },
  ],
}
