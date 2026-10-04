import type { Block } from 'payload'
import { pageEditor } from '../editor/pageLexical'
import { allOf, httpUrlOrPath, maxChars } from './validators'

/** Most blocks a page may hold. */
export const MAX_PAGE_BLOCKS = 40

/**
 * The page building blocks (WP-P). A later wave adds a block by adding one entry here, one component in
 * `components/blocks/` and one case in `components/blocks/render-blocks.tsx`; `tests/blocks-config.test.ts`
 * pins the list (exactly three) and is updated in the same change.
 */
export const textBlock: Block = {
  slug: 'text',
  labels: { singular: 'Text', plural: 'Text blocks' },
  fields: [{ name: 'richText', label: 'Text', type: 'richText', editor: pageEditor, required: true }],
}

export const imageBlock: Block = {
  slug: 'image',
  labels: { singular: 'Picture', plural: 'Pictures' },
  fields: [
    { name: 'image', label: 'Picture', type: 'upload', relationTo: 'media', required: true, admin: { description: 'Click the button, then drop the picture in.' } },
    {
      name: 'alt',
      label: 'Describe the picture',
      type: 'text',
      required: true,
      validate: maxChars(250, { required: true }),
      admin: { description: 'A few words for people who cannot see it, for example "Under 12s with the premiership cup". Filled in from the picture’s own description when it has one.' },
      hooks: {
        beforeValidate: [
          async ({ value, siblingData, req }) => {
            if (typeof value === 'string' && value.trim()) return value
            const ref = (siblingData as { image?: unknown }).image
            const id = typeof ref === 'number' ? ref : typeof ref === 'object' && ref !== null ? (ref as { id?: number }).id : undefined
            if (!id) return value
            try {
              const media = await req.payload.findByID({ collection: 'media', id, depth: 0, req })
              return typeof media.alt === 'string' ? media.alt : value
            } catch {
              return value
            }
          },
        ],
      },
    },
    { name: 'caption', label: 'Caption (optional)', type: 'text', defaultValue: '', validate: maxChars(250) },
    {
      name: 'width',
      label: 'How wide?',
      type: 'select',
      defaultValue: 'wide',
      required: true,
      options: [
        { label: 'Narrow (same width as the text)', value: 'narrow' },
        { label: 'Wide', value: 'wide' },
        { label: 'Full width', value: 'full' },
      ],
    },
  ],
}

export const ctaBlock: Block = {
  slug: 'cta',
  labels: { singular: 'Button', plural: 'Buttons' },
  fields: [
    { name: 'label', label: 'Button words', type: 'text', required: true, validate: maxChars(60, { required: true }), admin: { placeholder: 'e.g. Get in touch' } },
    {
      name: 'url',
      label: 'Where does it go?',
      type: 'text',
      required: true,
      validate: allOf(maxChars(500, { required: true }), httpUrlOrPath),
      admin: { description: 'A page on this site such as /contact, or a full web address starting with https://.', placeholder: '/contact' },
    },
    {
      name: 'style',
      label: 'Look',
      type: 'select',
      defaultValue: 'primary',
      required: true,
      options: [
        { label: 'Solid (stands out)', value: 'primary' },
        { label: 'Outline (quieter)', value: 'outline' },
      ],
    },
    { name: 'note', label: 'Small print under the button (optional)', type: 'text', defaultValue: '', validate: maxChars(200) },
  ],
}

export const pageBlocks: Block[] = [textBlock, imageBlock, ctaBlock]
