import { cn } from '@/lib/utils'

type SectionHeadingProps = {
  eyebrow?: string
  title: string
  intro?: string
  align?: 'left' | 'center'
  className?: string
}

export function SectionHeading({ eyebrow, title, intro, align = 'left', className }: SectionHeadingProps) {
  return (
    <div className={cn('max-w-2xl', align === 'center' && 'mx-auto text-center', className)}>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h2 className="mt-2 text-balance text-3xl font-bold tracking-tight text-brand-black sm:text-4xl">
        {title}
      </h2>
      {intro && <p className="mt-4 text-base leading-relaxed text-neutral-600 sm:text-lg">{intro}</p>}
    </div>
  )
}
