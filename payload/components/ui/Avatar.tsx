/* eslint-disable @next/next/no-img-element -- admin thumbnails come from the media library at any size; next/image would need every host allowed */
import { initials } from '../../../lib/identity'
import { cx } from './cx'

/**
 * A person's photo, or their initials on a theme tint when there is none. With `fit="contain"` the same component shows a sponsor
 * logo on a paper tile (the whole logo, never cropped). The picture is decorative: the name next to it says who it is.
 */
export function Avatar({ src, name, size = 40, fit = 'cover', className }: { src?: string | null; name?: string | null; size?: number; fit?: 'cover' | 'contain'; className?: string }) {
  return (
    <span className={cx('ui-avatar', fit === 'contain' && 'ui-avatar--contain', className)} style={{ width: size, height: size }} aria-hidden="true">
      {src ? <img src={src} alt="" loading="lazy" decoding="async" width={size} height={size} /> : <span className="ui-avatar__initials" style={{ fontSize: Math.max(11, Math.round(size * 0.38)) }}>{initials(name ?? '') || '?'}</span>}
    </span>
  )
}
