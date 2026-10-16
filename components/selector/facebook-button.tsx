import { FacebookIcon } from '@/components/icons'
import { selectorPaths } from '@/config/site'

/** "Continue with Facebook": a plain link to the start route (which is a 404 unless the club's Meta app is configured). */
export function FacebookButton({ next, invite, link, label = 'Continue with Facebook' }: { next?: string; invite?: string; link?: boolean; label?: string }) {
  const q = new URLSearchParams()
  if (next) q.set('next', next)
  if (invite) q.set('invite', invite)
  if (link) q.set('link', '1')
  const qs = q.toString()
  return (
    <a
      href={`${selectorPaths.facebookStart}${qs ? `?${qs}` : ''}`}
      className="flex min-h-12 w-full items-center justify-center gap-3 rounded-lg bg-brand-black px-4 text-base font-semibold text-white transition hover:bg-brand-charcoal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-gold"
    >
      <FacebookIcon className="h-5 w-5 shrink-0 text-brand-gold" />
      {label}
    </a>
  )
}
