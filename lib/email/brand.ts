import type { ResolvedTheme } from '@/lib/theme/resolve'
import type { MailBrand } from './render'

/** Mail clients cannot load the club's web font, so messages use a safe system stack. The colours are the club's own, from the theme. */
const SAFE_FONT = "Arial, 'Helvetica Neue', Helvetica, sans-serif"

export function brandFromTheme(theme: Pick<ResolvedTheme, 'colors'>): MailBrand {
  const c = theme.colors
  return { band: c.black, text: c.charcoal, muted: c.grey, link: c.black, surface: c.cream, font: SAFE_FONT }
}
