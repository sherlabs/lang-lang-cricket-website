import { cn } from '@/lib/utils'

type SectionHeadingProps = {
  eyebrow?: string
  title: string
  intro?: string
  align?: 'left' | 'center'
  /** Use on dark backgrounds. */
  tone?: 'light' | 'dark'
  className?: string
}

export function SectionHeading({
  eyebrow,
  title,
  intro,
  align = 'left',
  tone = 'light',
  className,
}: SectionHeadingProps) {
  const dark = tone === 'dark'
  return (
    <div className={cn('max-w-2xl', align === 'center' && 'mx-auto text-center', className)}>
      {eyebrow && <p className={cn('eyebrow', dark && 'text-brand-gold')}>{eyebrow}</p>}
      <h2
        className={cn(
          'display mt-3 text-balance text-4xl sm:text-5xl',
          dark ? 'text-white' : 'text-brand-black'
        )}
      >
        {title}
      </h2>
      {intro && (
        <p
          className={cn(
            'mt-4 text-base leading-relaxed sm:text-lg',
            dark ? 'text-white/75' : 'text-brand-grey'
          )}
        >
          {intro}
        </p>
      )}
    </div>
  )
}
