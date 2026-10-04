import {
  BlockquoteFeature,
  BoldFeature,
  FixedToolbarFeature,
  HeadingFeature,
  HorizontalRuleFeature,
  InlineToolbarFeature,
  ItalicFeature,
  LinkFeature,
  OrderedListFeature,
  ParagraphFeature,
  UnorderedListFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'

/**
 * The rich text for a page's text block (WP-P): a subset of the story feature set, so the one shared
 * renderer (`components/stories/story-body.tsx`) draws it. Paragraphs, headings h2 and h3, bold, italic,
 * links with an address only (no new-tab switch, no internal-document links), both list kinds, quotes
 * and a divider. No pictures here (the image block does that), no raw HTML, no embeds.
 */
export const pageFeatures = () => [
  ParagraphFeature(),
  HeadingFeature({ enabledHeadingSizes: ['h2', 'h3'] }),
  BoldFeature(),
  ItalicFeature(),
  BlockquoteFeature(),
  UnorderedListFeature(),
  OrderedListFeature(),
  HorizontalRuleFeature(),
  LinkFeature({
    enabledCollections: [],
    fields: ({ defaultFields }) => defaultFields.filter((f) => !('name' in f) || f.name !== 'newTab'),
  }),
  FixedToolbarFeature(),
  InlineToolbarFeature(),
]

export const pageEditor = lexicalEditor({ features: pageFeatures })
