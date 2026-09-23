import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'

/** Shared Tiptap extension set used by the editor (client) and HTML rendering (server). */
export const STORY_EXTENSIONS = [
  StarterKit,
  Image,
  Link.configure({ openOnClick: false }),
]
