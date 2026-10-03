import type { JSXConvertersFunction } from '@payloadcms/richtext-lexical/react'
import { RichText } from '@payloadcms/richtext-lexical/react'
import type { StoryContent } from '@/lib/domain'
import { isSafeHref } from '@/lib/story-href'
import { listStart } from '@/lib/story-list-start'

type UploadValue = { url?: string | null; alt?: string | null } | number | null | undefined

/**
 * Story body converters (spec §5): images are a plain `<img src alt loading="lazy">` (no
 * width/height, matching the old HTML so `.story-content img` sizes them the same); links keep
 * only http(s)/mailto hrefs and render anything else as plain text. An empty paragraph is a bare
 * `<p></p>` as before (zero height, its margin collapses) — not the default `<p><br/></p>`, which
 * would turn every blank line into a visible gap. An ordered list keeps its `start`, as the
 * Tiptap HTML had it.
 */
const storyJsxConverters: JSXConvertersFunction = ({ defaultConverters }) => ({
  ...defaultConverters,
  upload: ({ node }) => {
    const value = (node as { value?: UploadValue }).value
    if (!value || typeof value !== 'object' || !value.url) return null
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={value.url} alt={value.alt ?? ''} loading="lazy" />
  },
  paragraph: ({ node, nodesToJSX }) => <p>{nodesToJSX({ nodes: node.children })}</p>,
  list: ({ node, nodesToJSX }) => {
    const children = nodesToJSX({ nodes: node.children })
    const className = `list-${node.listType}`
    if (node.tag !== 'ol') return <ul className={className}>{children}</ul>
    return (
      <ol className={className} start={listStart((node as { start?: unknown }).start) ?? undefined}>
        {children}
      </ol>
    )
  },
  link: ({ node, nodesToJSX }) => {
    const children = nodesToJSX({ nodes: node.children })
    const href = (node.fields as { url?: unknown } | undefined)?.url
    if (!isSafeHref(href)) return <>{children}</>
    return <a href={href.trim()}>{children}</a>
  },
})

/**
 * A story's body, rendered from Lexical through React (no `dangerouslySetInnerHTML`). Used on
 * `/history/[slug]` and `/history/drafts/[token]`. The content must be fetched at `depth: 1`
 * so upload nodes carry their media doc.
 */
export function StoryBody({ content, className = 'story-content' }: { content: StoryContent | null; className?: string }) {
  if (!content) return <div className={className} />
  return <RichText data={content as unknown as Parameters<typeof RichText>[0]['data']} converters={storyJsxConverters} className={className} />
}
