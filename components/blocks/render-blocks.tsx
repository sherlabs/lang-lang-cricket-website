import type { PageBlock } from '@/lib/domain'
import { CtaBlock } from './cta-block'
import { ImageBlock } from './image-block'
import { TextBlock } from './text-block'

/**
 * Draws a page's blocks in order. A new block type adds one case here, one component in this folder and one
 * entry in `payload/fields/blocks.ts` (`tests/blocks-config.test.ts` pins the list).
 */
export function RenderBlocks({ blocks }: { blocks: PageBlock[] }) {
  return (
    <div className="space-y-10">
      {blocks.map((block) => {
        switch (block.blockType) {
          case 'text':
            return (
              <div key={block.id} className="mx-auto max-w-2xl">
                <TextBlock block={block} />
              </div>
            )
          case 'image':
            return <ImageBlock key={block.id} block={block} />
          case 'cta':
            return <CtaBlock key={block.id} block={block} />
        }
      })}
    </div>
  )
}
