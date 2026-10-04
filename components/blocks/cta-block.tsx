import Link from 'next/link'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowRight01Icon } from '@hugeicons/core-free-icons'
import type { PageBlock } from '@/lib/domain'
import { isHttpUrlOrPath } from '@/payload/fields/validators'
import { cn } from '@/lib/utils'

type CtaBlockData = Extract<PageBlock, { blockType: 'cta' }>

const STYLE: Record<CtaBlockData['style'], string> = {
  primary: 'bg-brand-gold text-brand-black hover:bg-brand-gold-light',
  outline: 'border border-brand-black/15 text-brand-black hover:border-brand-gold hover:bg-brand-gold-pale',
}

/** A button. An address that is neither http(s) nor a site path (something odd stored over the API) renders nothing. */
export function CtaBlock({ block }: { block: CtaBlockData }) {
  const url = block.url.trim()
  if (!block.label || !isHttpUrlOrPath(url)) return null
  const cls = cn('inline-flex min-h-11 items-center gap-2 rounded-md px-5 py-3 text-sm font-semibold transition', STYLE[block.style])
  const internal = url.startsWith('/')
  return (
    <div className="mx-auto max-w-2xl">
      {internal ? (
        <Link href={url} className={cls}>
          {block.label}
          <HugeiconsIcon icon={ArrowRight01Icon} className="h-4 w-4" aria-hidden />
        </Link>
      ) : (
        <a href={url} rel="noopener" className={cls}>
          {block.label}
          <HugeiconsIcon icon={ArrowRight01Icon} className="h-4 w-4" aria-hidden />
        </a>
      )}
      {block.note && <p className="mt-2 text-sm text-brand-grey">{block.note}</p>}
    </div>
  )
}
