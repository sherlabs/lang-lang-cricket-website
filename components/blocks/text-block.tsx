import { StoryBody } from '@/components/stories/story-body'
import type { PageBlock } from '@/lib/domain'

/** A rich-text block, drawn by the same renderer as stories (no raw HTML, unsafe links become plain text). */
export function TextBlock({ block }: { block: Extract<PageBlock, { blockType: 'text' }> }) {
  return <StoryBody content={block.content} className="story-content" />
}
