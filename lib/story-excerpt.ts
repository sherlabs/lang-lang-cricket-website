/**
 * Pure excerpt helper (no DOM, no Tiptap): shared by the public story actions and the
 * `storyLifecycle` hook, which must not pull jsdom/Tiptap into the Payload config.
 */

/** Strip tags and collapse whitespace for a list-view excerpt (160 chars, word boundary). */
export function htmlToExcerpt(html: string, maxLen = 160): string {
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen).replace(/\s+\S*$/, '') + '…'
}
