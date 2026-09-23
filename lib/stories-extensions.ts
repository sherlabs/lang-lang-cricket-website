import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'

// Restrict the Link mark's schema to just `href` — the default schema also
// allows `target`, `rel` and `class`, which a crafted Tiptap JSON payload
// (e.g. a public story submission) could otherwise use to render a
// click-hijacking overlay wherever the content is rendered, including on the
// admin review page. Attributes not declared here are silently dropped by
// ProseMirror when parsing any doc, so no attacker value can reach the
// renderer.
const RestrictedLink = Link.extend({
  // The base Link extension's own renderHTML merges in `this.options.HTMLAttributes`
  // (a static `target`/`rel` pair set in its addOptions) on top of the per-node
  // attrs, independent of addAttributes below — so overriding addAttributes alone
  // isn't enough to drop them from the rendered HTML. `.configure({ HTMLAttributes: {} })`
  // doesn't work either: Tiptap's `configure()` deep-merges options, so an empty
  // object leaves the parent's target/rel untouched. Overriding addOptions instead
  // *replaces* HTMLAttributes outright. Deliberately not overriding renderHTML itself,
  // so the parent's `isAllowedUri` href-protocol check (XSS guard) still runs.
  addOptions() {
    return { ...this.parent?.(), HTMLAttributes: {} }
  },
  addAttributes() {
    return {
      href: {
        default: null,
        parseHTML: (element) => element.getAttribute('href'),
        renderHTML: (attributes) => (attributes.href ? { href: attributes.href } : {}),
      },
    }
  },
})

/** Shared Tiptap extension set used by the editor (client) and HTML rendering (server). */
export const STORY_EXTENSIONS = [
  StarterKit,
  Image,
  RestrictedLink.configure({ openOnClick: false }),
]
