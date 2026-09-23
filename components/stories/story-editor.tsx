'use client'

import { useCallback, useRef, useState } from 'react'
import { useEditor, EditorContent, BubbleMenu, FloatingMenu } from '@tiptap/react'
import type { JSONContent } from '@tiptap/core'
import Placeholder from '@tiptap/extension-placeholder'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  BoldIcon,
  ItalicIcon,
  Link01Icon,
  TextIcon,
  ListViewIcon,
  QuoteUpIcon,
  Add01Icon,
  Cancel01Icon,
  Image01Icon,
  SolidLine01Icon,
} from '@hugeicons/core-free-icons'
import { STORY_EXTENSIONS } from '@/lib/stories-extensions'
import { optimiseImage } from '@/lib/blob-client'

const EMPTY_DOC: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] }

type Props = {
  /** Name of the hidden form field this editor serialises its Tiptap JSON into. */
  name: string
  initialContent?: JSONContent
  /** Uploads an image file and returns its public URL. Differs between the admin editor (authenticated route) and the public submission form (unauthenticated route). */
  uploadImage: (file: File) => Promise<string>
}

export function StoryEditor({ name, initialContent, uploadImage }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkValue, setLinkValue] = useState('')
  const [uploading, setUploading] = useState(false)
  const [plusMenuOpen, setPlusMenuOpen] = useState(false)
  // Controlled state, not a ref mutation: a ref written to from Tiptap's
  // onUpdate can end up pointing at a hidden input that's no longer the one
  // React keeps mounted (e.g. after a dev-mode double-render), silently
  // submitting the empty default doc. State re-renders the real DOM node.
  const [contentJson, setContentJson] = useState(() => JSON.stringify(initialContent ?? EMPTY_DOC))

  const editor = useEditor({
    extensions: [
      ...STORY_EXTENSIONS,
      Placeholder.configure({ placeholder: 'Tell your story…' }),
    ],
    content: initialContent ?? EMPTY_DOC,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      setContentJson(JSON.stringify(editor.getJSON()))
    },
  })

  const insertImage = useCallback(
    async (file: File) => {
      if (!editor) return
      setUploading(true)
      try {
        const prepared = await optimiseImage(file, { maxEdge: 1600 })
        const url = await uploadImage(prepared)
        editor.chain().focus().setImage({ src: url }).run()
        setContentJson(JSON.stringify(editor.getJSON()))
      } finally {
        setUploading(false)
      }
    },
    [editor, uploadImage]
  )

  const applyLink = () => {
    if (!editor) return
    if (linkValue) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: linkValue }).run()
    } else {
      editor.chain().focus().unsetLink().run()
    }
    setContentJson(JSON.stringify(editor.getJSON()))
    setLinkOpen(false)
  }

  if (!editor) return null

  return (
    <div>
      {/* Medium-style selection toolbar: only exists while text is selected. The
          tippy popper mounts inside the surrounding <form>, so Enter in the URL
          field must be intercepted or it submits the whole story. */}
      <BubbleMenu
        editor={editor}
        className="story-bubble-menu"
        tippyOptions={{ duration: 100, onHide: () => setLinkOpen(false) }}
      >
        {linkOpen ? (
          <input
            type="url"
            autoFocus
            value={linkValue}
            onChange={(e) => setLinkValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                applyLink()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                setLinkOpen(false)
                editor.chain().focus().run()
              }
            }}
            placeholder="Paste or type a link…"
            aria-label="Link URL"
            className="story-bubble-menu-input"
          />
        ) : (
          <>
            <button
              type="button"
              aria-pressed={editor.isActive('bold')}
              onClick={() => editor.chain().focus().toggleBold().run()}
              aria-label="Bold"
            >
              <HugeiconsIcon icon={BoldIcon} className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              aria-pressed={editor.isActive('italic')}
              onClick={() => editor.chain().focus().toggleItalic().run()}
              aria-label="Italic"
            >
              <HugeiconsIcon icon={ItalicIcon} className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              aria-pressed={editor.isActive('link')}
              onClick={() => {
                setLinkValue((editor.getAttributes('link').href as string) ?? '')
                setLinkOpen(true)
              }}
              aria-label="Link"
            >
              <HugeiconsIcon icon={Link01Icon} className="h-4 w-4" aria-hidden />
            </button>
            <span className="story-bubble-menu-divider" aria-hidden />
            <button
              type="button"
              aria-pressed={editor.isActive('heading', { level: 2 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              aria-label="Large heading"
            >
              <HugeiconsIcon icon={TextIcon} className="h-5 w-5" aria-hidden />
            </button>
            <button
              type="button"
              aria-pressed={editor.isActive('heading', { level: 3 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              aria-label="Small heading"
            >
              <HugeiconsIcon icon={TextIcon} className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              aria-pressed={editor.isActive('blockquote')}
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              aria-label="Quote"
            >
              <HugeiconsIcon icon={QuoteUpIcon} className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              aria-pressed={editor.isActive('bulletList')}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              aria-label="Bulleted list"
            >
              <HugeiconsIcon icon={ListViewIcon} className="h-4 w-4" aria-hidden />
            </button>
          </>
        )}
      </BubbleMenu>

      {/* "+" in the left margin of an empty line, as on Medium/Ghost. FloatingMenu
          only shows itself when the caret sits in an empty text block. The
          popper is anchored left-start, so its own box stays one button wide
          and the expanded row overflows rightward (absolute) — otherwise tippy
          would re-anchor and shove the "+" leftward when the row appears. */}
      <FloatingMenu
        editor={editor}
        className="story-floating-menu"
        tippyOptions={{ duration: 100, placement: 'left-start', onHide: () => setPlusMenuOpen(false) }}
      >
        <button
          type="button"
          className="group"
          aria-expanded={plusMenuOpen}
          aria-label={plusMenuOpen ? 'Close menu' : 'Insert block'}
          onClick={() => {
            setPlusMenuOpen((open) => !open)
            if (plusMenuOpen) editor.chain().focus().run()
          }}
        >
          <HugeiconsIcon
            icon={plusMenuOpen ? Cancel01Icon : Add01Icon}
            className="h-4 w-4 transition-transform duration-200 group-aria-expanded:rotate-90"
            aria-hidden
          />
          <span className="story-tooltip">{plusMenuOpen ? 'Close menu' : 'Insert block'}</span>
        </button>
        <div className="story-plus-row" data-open={plusMenuOpen} aria-hidden={!plusMenuOpen}>
          <button
            type="button"
            className="group"
            disabled={uploading}
            tabIndex={plusMenuOpen ? 0 : -1}
            onClick={() => fileRef.current?.click()}
            aria-label="Insert image"
          >
            <HugeiconsIcon icon={Image01Icon} className="h-4 w-4" aria-hidden />
            <span className="story-tooltip">Image</span>
          </button>
          <button
            type="button"
            className="group"
            tabIndex={plusMenuOpen ? 0 : -1}
            onClick={() => {
              editor.chain().focus().setHorizontalRule().run()
              setPlusMenuOpen(false)
            }}
            aria-label="Insert divider"
          >
            <HugeiconsIcon icon={SolidLine01Icon} className="h-4 w-4" aria-hidden />
            <span className="story-tooltip">Divider</span>
          </button>
        </div>
      </FloatingMenu>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) insertImage(file)
          e.target.value = ''
        }}
      />

      <EditorContent editor={editor} className="story-content pt-2" data-plus-open={plusMenuOpen} />
      {uploading && <p className="text-xs text-brand-grey">Uploading image…</p>}
      <input type="hidden" name={name} value={contentJson} readOnly />
    </div>
  )
}
