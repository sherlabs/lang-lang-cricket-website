import { themeCss } from '@/lib/theme/css'
import type { ResolvedTheme } from '@/lib/theme/resolve'

/** Inlines the twelve `--brand-*` variables. `themeCss` only ever emits validated digits, so the string is injection-safe. */
export function ThemeStyle({ theme }: { theme: Pick<ResolvedTheme, 'channels'> }) {
  return <style id="club-theme" dangerouslySetInnerHTML={{ __html: themeCss(theme) }} />
}
