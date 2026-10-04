import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowUpRight01Icon, ShirtIcon } from '@hugeicons/core-free-icons'
import type { Apparel } from '@/lib/club-merge'
import { cn } from '@/lib/utils'

export type ApparelVariant = 'nav' | 'mobile' | 'footer' | 'banner'

const base = 'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-semibold transition focus-visible:outline-2'

const variants: Record<ApparelVariant, string> = {
  // Outlined gold so it reads as the shop, distinct from the solid "Get in touch" button beside it.
  nav: 'ml-2 min-h-10 rounded-md border border-brand-gold px-3 py-2 text-sm text-brand-gold hover:bg-brand-gold hover:text-brand-black',
  mobile: 'mt-4 min-h-11 w-full rounded-md border border-brand-gold px-4 py-3 text-sm text-brand-gold hover:bg-brand-gold hover:text-brand-black',
  footer: 'min-h-9 rounded-sm text-sm text-brand-gold hover:text-brand-gold-light',
  // The loudest one: solid gold on the black home strip.
  banner: 'min-h-12 rounded-md bg-brand-gold px-6 py-3 text-base text-brand-black hover:bg-brand-gold-light',
}

/**
 * External link to the club's merchandise shop. Opens in a new tab with `noopener`. The caller
 * passes `club.apparel`; when it is null (no URL set) this renders NOTHING, so there is never a
 * dead button.
 */
export function ApparelLink({ apparel, variant, className, onClick }: { apparel: Apparel | null | undefined; variant: ApparelVariant; className?: string; onClick?: () => void }) {
  if (!apparel) return null
  return (
    <a
      href={apparel.url}
      target="_blank"
      rel="noopener noreferrer"
      data-apparel={variant}
      title={apparel.label}
      onClick={onClick}
      className={cn(base, variants[variant], className)}
    >
      <HugeiconsIcon icon={ShirtIcon} className="h-4 w-4 shrink-0" aria-hidden />
      {/* In the tight desktop nav the label only shows once there is room (lg); the link keeps its name. */}
      <span className={variant === 'nav' ? 'sr-only lg:not-sr-only' : undefined}>{apparel.label}</span>
      <span className="sr-only"> (opens the shop in a new tab)</span>
      <HugeiconsIcon icon={ArrowUpRight01Icon} className={cn('h-4 w-4 shrink-0', variant === 'nav' && 'hidden lg:block')} aria-hidden />
    </a>
  )
}

/** Full-width strip under the home hero. Nothing when there is no link. */
export function ApparelBanner({ apparel }: { apparel: Apparel | null | undefined }) {
  if (!apparel) return null
  return (
    <section aria-label={apparel.label} className="relative overflow-hidden bg-brand-black text-white">
      <div className="h-1 w-full bg-gradient-to-r from-brand-gold-dark via-brand-gold to-brand-gold-light" />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-gold/15 blur-3xl"
      />
      <div className="container-site relative flex flex-col gap-5 py-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-gold text-brand-black">
            <HugeiconsIcon icon={ShirtIcon} className="h-6 w-6" aria-hidden />
          </span>
          <div>
            <p className="display text-2xl text-brand-gold sm:text-3xl">{apparel.label}</p>
            {apparel.blurb && <p className="mt-1 max-w-xl text-sm text-white/80 sm:text-base">{apparel.blurb}</p>}
          </div>
        </div>
        <ApparelLink apparel={apparel} variant="banner" />
      </div>
    </section>
  )
}
