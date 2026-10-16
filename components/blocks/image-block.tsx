import type { PageBlock } from '@/lib/domain'
import { cn } from '@/lib/utils'

type ImageBlockData = Extract<PageBlock, { blockType: 'image' }>

/** `narrow` lines up with the text column, `wide` is a little broader, `full` spans the whole content width. */
export const IMAGE_WIDTH_CLASS: Record<ImageBlockData['width'], string> = {
  narrow: 'max-w-2xl',
  wide: 'max-w-4xl',
  full: '',
}

export function ImageBlock({ block }: { block: ImageBlockData }) {
  return (
    <figure className={cn('mx-auto', IMAGE_WIDTH_CLASS[block.width])}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={block.url} alt={block.alt} loading="lazy" className="w-full rounded-2xl object-cover" />
      {block.caption && <figcaption className="mt-3 text-sm text-brand-grey">{block.caption}</figcaption>}
    </figure>
  )
}
