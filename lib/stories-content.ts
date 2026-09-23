import { generateHTML, type JSONContent } from '@tiptap/core'
import { JSDOM } from 'jsdom'
import { STORY_EXTENSIONS } from './stories-extensions'

// Tiptap's generateHTML() needs a DOM even on the server (it throws
// "window is not defined" without one). Polyfill it once per process.
function ensureDom() {
  if (typeof document !== 'undefined') return
  const dom = new JSDOM('<!DOCTYPE html>')
  // @ts-expect-error - polyfilling globals for Tiptap's server-side render
  global.window = dom.window
  global.document = dom.window.document
}

/** Render a Tiptap document to HTML on the server, for storage and public rendering. */
export function renderStoryHtml(doc: JSONContent): string {
  ensureDom()
  return generateHTML(doc, STORY_EXTENSIONS)
}

/** Strip tags and collapse whitespace for a list-view excerpt. */
export function htmlToExcerpt(html: string, maxLen = 160): string {
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen).replace(/\s+\S*$/, '') + '…'
}
