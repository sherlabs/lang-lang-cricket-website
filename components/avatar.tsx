/* eslint-disable @next/next/no-img-element */
import { initials } from '@/lib/identity'
import { cn } from '@/lib/utils'

/**
 * The single photo-or-initials rule for every individual on the site (people cards, player
 * tiles, the player hero, player sponsor tiles). Pass the already-resolved `photoUrl`
 * (lib/identity.ts `resolvePhotoUrl`); an empty string shows the initials. Fills its parent.
 */
export function Avatar({
  name,
  photoUrl,
  alt = '',
  className,
  imgClassName,
  initialsClassName,
}: {
  name: string
  photoUrl: string
  /** Empty (decorative) unless the photo is the only place the name appears. */
  alt?: string
  className?: string
  imgClassName?: string
  initialsClassName?: string
}) {
  return photoUrl ? (
    <img src={photoUrl} alt={alt} loading="lazy" className={cn('h-full w-full object-cover', imgClassName, className)} />
  ) : (
    <span
      aria-hidden
      className={cn('display flex h-full w-full items-center justify-center text-5xl text-brand-grey-light', initialsClassName, className)}
    >
      {initials(name)}
    </span>
  )
}
