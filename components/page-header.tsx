import { cn } from '@/lib/utils'

type PageHeaderProps = {
  eyebrow: string
  title: string
  intro?: string
  className?: string
  children?: React.ReactNode
}

/** Dark, crest-coloured banner used at the top of every inner page. */
export function PageHeader({ eyebrow, title, intro, className, children }: PageHeaderProps) {
  return (
    <section className={cn('relative overflow-hidden bg-brand-black text-white', className)}>
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-gold/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-brand-gold/10 blur-3xl"
      />
      <div className="container-site relative py-16 sm:py-20 lg:py-24">
        <p className="eyebrow text-brand-gold">{eyebrow}</p>
        <h1 className="display mt-4 max-w-3xl text-balance text-5xl sm:text-6xl lg:text-7xl">
          {title}
        </h1>
        {intro && <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/75">{intro}</p>}
        {children}
      </div>
    </section>
  )
}
