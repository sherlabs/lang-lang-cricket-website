/**
 * Pure helpers for rendering announcements on the public site. No React/Next
 * imports so both the server pages and the client banner can use them.
 */
import { CLUB_LOCALE, CLUB_TIMEZONE, COOKIE_PREFIX } from '@/config/site'

/** Cookie the visitor sets by dismissing the home banner; value is the announcement id. */
export const ANNOUNCEMENT_DISMISS_COOKIE = `${COOKIE_PREFIX}_ann_dismissed`

/** Textarea input may arrive with CRLF line endings. */
const normalise = (body: string) => body.replace(/\r\n?/g, '\n')

/**
 * First non-empty line of the body, truncated on a word boundary with an
 * ellipsis when it runs past `max` characters. Feeds the home banner.
 */
export function excerpt(body: string, max = 140): string {
  const first = normalise(body)
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0)
  if (!first) return ''
  if (first.length <= max) return first
  const cut = first.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  const head = (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.!?-]+$/, '')
  return `${head}…`
}

/**
 * Paragraphs split on blank lines. Single line breaks stay inside a paragraph
 * (render with `whitespace-pre-line` so they show as `<br>`).
 */
export function bodyParagraphs(body: string): string[] {
  return normalise(body)
    .split(/\n[ \t]*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
}

/**
 * Whether the home banner should render: there is a published announcement
 * and the visitor has not dismissed *this* one. A new announcement therefore
 * shows again even after an older one was dismissed.
 */
export function shouldShowBanner(latestId: number | null | undefined, cookieValue: string | undefined): boolean {
  if (latestId == null) return false
  return cookieValue !== String(latestId)
}

/** `30 September 2026` in the club's timezone, regardless of the server's zone. */
export function formatAnnouncementDate(d: Date): string {
  const list = new Intl.DateTimeFormat(CLUB_LOCALE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: CLUB_TIMEZONE,
  }).formatToParts(d)
  const get = (t: Intl.DateTimeFormatPartTypes) => list.find((p) => p.type === t)?.value ?? ''
  return `${get('day')} ${get('month')} ${get('year')}`
}
