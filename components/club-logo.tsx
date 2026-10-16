import Image from 'next/image'

type Props = { src: string; alt: string; width: number; height: number; className?: string; priority?: boolean }

/**
 * The club crest. The static fallback under /assets/ goes through next/image as before; an
 * uploaded logo (Payload media: Blob in production, /api/media/file/… locally) is a plain
 * <img>, since no next/image is used for Blob URLs (spec §7.3) and no remote hosts are allowed.
 */
export function ClubLogo({ src, alt, width, height, className, priority }: Props) {
  if (src.startsWith('/assets/')) {
    return <Image src={src} alt={alt} width={width} height={height} className={className} priority={priority} />
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- uploaded logo, see above
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      decoding="async"
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
    />
  )
}
