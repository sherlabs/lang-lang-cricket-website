import type { Field, GlobalConfig } from 'payload'
import { ValidationError } from 'payload'
import { anyone, isAdmin } from '../access'
import { hiddenFromEditors } from '../admin/visibility'
import { revalidatePaths } from '../hooks/revalidate'
import { checkTheme, colorsFromForm } from '../../lib/theme/contrast'
import { FONT_MENU } from '../../lib/theme/fonts'
import { resolveTheme } from '../../lib/theme/resolve'
import { FONT_KEYS, HEX_RE, normalizeHex, type PaletteRole, type ShadeName } from '../../lib/theme/tokens'
import { THEME_DEFAULTS } from '../seed/theme-defaults'

/** Hex fields: a three-digit value is expanded and everything is stored upper-case before validation. */
const hexField = (name: string, label: string, defaultValue: () => string, description: string): Field => ({
  name,
  label,
  type: 'text',
  // A function default is not written as SQL DEFAULT, so the migration stays club-neutral.
  defaultValue,
  required: true,
  admin: { description, placeholder: '#RRGGBB', width: '50%' },
  hooks: { beforeValidate: [({ value }) => normalizeHex(value) ?? value] },
  validate: (value: unknown) => (typeof value === 'string' && HEX_RE.test(value) ? true : 'Enter a colour as six hex digits after a #, using 0-9 and A-F.'),
})

const palette = (name: PaletteRole, label: string, description: string): Field => hexField(name, label, () => THEME_DEFAULTS.palette[name], description)
const shade = (name: ShadeName, label: string, description: string): Field => hexField(name, label, () => THEME_DEFAULTS.shades[name], description)

/**
 * The site's look: five main colours, seven other shades, the crest and the display font (spec
 * 2026-10-04 WP-T). Admin only. With no saved row the site renders the seed (`theme-defaults.ts`), so
 * production looks right before anyone saves. Read by the layouts through `getTheme()`.
 */
export const Theme: GlobalConfig = {
  slug: 'theme',
  label: 'Site look (colours and fonts)',
  admin: {
    group: false,
    hidden: hiddenFromEditors,
    description: 'The colours, crest and heading font of the whole website and this admin. Saving changes the live site within seconds.',
  },
  // Public read is harmless (it is only styling the visitor already sees); only admins change it.
  access: { read: anyone, update: isAdmin },
  hooks: {
    beforeValidate: [
      ({ data, originalDoc }) => {
        const seed = resolveTheme(null).colors
        const merged = {
          palette: { ...(originalDoc?.palette ?? {}), ...(data?.palette ?? {}) },
          shades: { ...(originalDoc?.shades ?? {}), ...(data?.shades ?? {}) },
        }
        const failing = checkTheme(colorsFromForm(merged, seed)).filter((r) => r.level === 'error' && !r.pass)
        if (failing.length) {
          throw new ValidationError({
            global: 'theme',
            errors: failing.map((r) => ({
              path: r.fields[0],
              message: `${r.label}: contrast ${r.ratio.toFixed(2)} to 1, needs at least ${r.min} to 1. Make the lighter colour lighter or the darker colour darker. Colours involved: ${r.fields.map((f) => f.split('.')[1]).join(', ')}.`,
            })),
          })
        }
        return data
      },
    ],
    afterChange: [
      async ({ doc, req }) => {
        // Every page and the admin read the variables: revalidate the whole root layout, as `club` does.
        await revalidatePaths(['/'], req.context, [], { layout: true })
        return doc
      },
    ],
  },
  fields: [
    {
      name: 'palette',
      label: 'Main colours',
      type: 'group',
      admin: { description: 'The five colours a designer chooses. Type a hex code as a # followed by six hex digits.' },
      fields: [
        palette('primary', 'Dark colour', 'Dark backgrounds, headings and dark buttons.'),
        palette('accent', 'Accent colour', 'Buttons, the current menu item, the keyboard focus ring and highlighted text.'),
        palette('surface', 'Light section colour', 'The alternate light band between page sections.'),
        palette('text', 'Body text colour', 'Normal reading text on light backgrounds.'),
        palette('muted', 'Secondary text colour', 'Introductions and less important text.'),
      ],
    },
    {
      name: 'shades',
      label: 'Other shades',
      type: 'group',
      admin: { description: 'Supporting shades. Leave them alone unless you changed the accent or dark colour; each one is edited directly.' },
      fields: [
        shade('ink', 'Raised dark surface', 'A slightly lighter dark for menus and badges on the dark colour.'),
        shade('accentDark', 'Accent, darker', 'The start of the thin gradient line under headings.'),
        shade('accentLight', 'Accent, lighter', 'Button hover and labels on dark backgrounds.'),
        shade('accentPale', 'Accent, pale tint', 'Tinted chips, callouts and date tiles.'),
        shade('accentDeep', 'Accent, deep (small text)', 'Small accent-coloured text on light backgrounds. Must be dark enough to read.'),
        shade('surfaceMuted', 'Card fill', 'Card backgrounds and empty states.'),
        shade('mutedLight', 'Caption colour', 'Captions and placeholders.'),
      ],
    },
    {
      name: 'contrastReport',
      type: 'ui',
      admin: { components: { Field: '/payload/components/ThemeContrast#ThemeContrast' } },
    },
    {
      name: 'crest',
      label: 'Club crest',
      type: 'upload',
      relationTo: 'media',
      // The stat cards can only draw PNG and JPEG; any other type would silently fall back to the bundled crest.
      filterOptions: { mimeType: { in: ['image/png', 'image/jpeg'] } },
      admin: {
        description:
          'A PNG (or JPEG; no SVG or WebP) with a transparent background, at least 512 pixels tall. It is shown on a white tile in the menu, footer and admin sign-in, and on the stat cards. If empty, the logo in Club details is used, then the bundled crest.',
      },
    },
    {
      name: 'headingFont',
      label: 'Heading font',
      type: 'select',
      defaultValue: () => THEME_DEFAULTS.headingFont,
      required: true,
      options: FONT_KEYS.map((k) => ({ value: k, label: FONT_MENU[k].label })),
      admin: { description: 'The display face for headings, numbers and the stat cards. The body text stays Inter.' },
    },
  ],
}
