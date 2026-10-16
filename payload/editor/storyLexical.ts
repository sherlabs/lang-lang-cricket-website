import {
  BlockquoteFeature,
  BoldFeature,
  FixedToolbarFeature,
  HeadingFeature,
  HorizontalRuleFeature,
  IndentFeature,
  InlineCodeFeature,
  InlineToolbarFeature,
  ItalicFeature,
  LinkFeature,
  OrderedListFeature,
  ParagraphFeature,
  StrikethroughFeature,
  UnorderedListFeature,
  UploadFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'

/**
 * The stories Lexical feature set (spec §5): exactly what the public Tiptap editor can
 * produce, so HTML ⇄ Lexical conversion is lossless in both directions. Shared by the
 * `stories.content` field and the converters in `lib/stories-convert.ts`.
 *
 * Disabled on purpose: underline, sub/superscript, alignment, checklist, relationship,
 * blocks, tables and internal links. Links are custom URLs with `href` only (no `newTab`).
 */
export const storyFeatures = () => [
  ParagraphFeature(),
  HeadingFeature({ enabledHeadingSizes: ['h2', 'h3', 'h4'] }),
  BoldFeature(),
  ItalicFeature(),
  StrikethroughFeature(),
  InlineCodeFeature(),
  BlockquoteFeature(),
  UnorderedListFeature(),
  OrderedListFeature(),
  IndentFeature(),
  HorizontalRuleFeature(),
  LinkFeature({
    enabledCollections: [],
    fields: ({ defaultFields }) => defaultFields.filter((f) => !('name' in f) || f.name !== 'newTab'),
  }),
  UploadFeature({ collections: { media: { fields: [] } } }),
  FixedToolbarFeature(),
  InlineToolbarFeature(),
]

export const storyEditor = lexicalEditor({ features: storyFeatures })
