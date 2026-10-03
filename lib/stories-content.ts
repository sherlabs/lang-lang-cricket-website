import { generateHTML, type JSONContent } from '@tiptap/core'
import { JSDOM } from 'jsdom'
import { STORY_EXTENSIONS } from './stories-extensions'

/**
 * Render a Tiptap document to HTML on the server. Since WP4 this is only the first step of
 * the story conversion pipeline (`lib/stories-convert.ts`): nothing stores or renders this
 * HTML directly any more.
 */
export function renderStoryHtml(doc: JSONContent): string {
  // Tiptap's generateHTML() needs a DOM even on the server (it throws
  // "window is not defined" without one). Set it up for just the duration of
  // this call and restore whatever was there before — generateHTML is fully
  // synchronous (no `await` inside), so no other request's code can interleave
  // between the set and the restore in Node's single-threaded event loop.
  // Leaving global.window/document set permanently would silently change the
  // behavior of any other code in the process that branches on
  // `typeof window !== 'undefined'`.
  const dom = new JSDOM('<!DOCTYPE html>')
  const g = globalThis as { window?: unknown; document?: unknown }
  const hadWindow = 'window' in g
  const prevWindow = g.window
  const prevDocument = g.document
  g.window = dom.window
  g.document = dom.window.document
  try {
    return generateHTML(doc, STORY_EXTENSIONS)
  } finally {
    if (hadWindow) {
      g.window = prevWindow
      g.document = prevDocument
    } else {
      delete g.window
      delete g.document
    }
  }
}
