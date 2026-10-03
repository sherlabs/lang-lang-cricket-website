/* eslint-disable @next/next/no-img-element */
import { cn } from '@/lib/utils'
import type { Sponsor } from '@/components/sponsor-logos'

export { selectCarouselSponsors } from '@/lib/site-settings-core'

/** Below this many logos a marquee looks silly; show them as a static centred row instead. */
const MARQUEE_MIN = 4

function Logo({ sponsor, tabIndex }: { sponsor: Sponsor; tabIndex?: number }) {
  const img = (
    <img
      src={sponsor.logoUrl}
      alt={sponsor.name}
      loading="lazy"
      className="h-12 w-auto max-w-[150px] object-contain sm:h-16 sm:max-w-[200px]"
    />
  )
  const base =
    'inline-flex min-h-11 shrink-0 items-center rounded-md opacity-85 transition duration-300 hover:opacity-100 focus-visible:opacity-100'
  return sponsor.linkUrl ? (
    <a
      href={sponsor.linkUrl}
      target="_blank"
      rel="noopener noreferrer"
      title={sponsor.name}
      aria-label={`${sponsor.name} (opens in a new tab)`}
      tabIndex={tabIndex}
      className={base}
    >
      {img}
    </a>
  ) : (
    <span title={sponsor.name} className={base}>
      {img}
    </span>
  )
}

type Props = { sponsors: Sponsor[]; className?: string }

/**
 * Calm full-width band under the hero: an eyebrow and a seamless scrolling
 * row of sponsor logos. Pauses on hover/focus, and becomes a static wrapped
 * row for people who prefer reduced motion. Renders nothing without logos.
 */
export function SponsorCarousel({ sponsors, className }: Props) {
  if (sponsors.length === 0) return null
  const marquee = sponsors.length >= MARQUEE_MIN
  // Roughly 5s per logo, so a longer list doesn't whip past.
  const duration = `${Math.max(24, sponsors.length * 5)}s`

  return (
    <section
      aria-label="Proudly supported by our sponsors"
      className={cn('overflow-hidden border-b border-brand-black/5 bg-brand-cream py-8 sm:py-10', className)}
    >
      <p className="eyebrow text-center">Proudly supported by</p>

      {marquee ? (
        <div className="sponsor-marquee mt-6 w-full sm:mt-7" style={{ '--marquee-duration': duration } as React.CSSProperties}>
          <div className="sponsor-marquee-track flex w-max items-center">
            <ul className="flex shrink-0 items-center">
              {sponsors.map((s) => (
                <li key={s.id} className="px-6 sm:px-9">
                  <Logo sponsor={s} />
                </li>
              ))}
            </ul>
            {/* Second copy makes the loop seamless; hidden from assistive tech and the tab order. */}
            <ul aria-hidden className="sponsor-marquee-dup flex shrink-0 items-center">
              {sponsors.map((s) => (
                <li key={`dup-${s.id}`} className="px-6 sm:px-9">
                  <Logo sponsor={s} tabIndex={-1} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <ul className="container-site mt-6 flex flex-wrap items-center justify-center gap-x-12 gap-y-5 sm:mt-7">
          {sponsors.map((s) => (
            <li key={s.id}>
              <Logo sponsor={s} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
