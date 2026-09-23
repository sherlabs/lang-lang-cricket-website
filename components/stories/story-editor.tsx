'use client'

import { useCallback, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import type { JSONContent } from '@tiptap/core'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  BoldIcon,
  ItalicIcon,
  Image01Icon,
  Link01Icon,
  Heading02Icon,
  ListViewIcon,
  QuoteUpIcon,
} from '@hugeicons/core-free-icons'
import { STORY_EXTENSIONS } from '@/lib/stories-extensions'
import { optimiseImage } from '@/lib/blob-client'
import { cn } from '@/lib/utils'

const EMPTY_DOC: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] }

type Props = {
  /** Name of the hidden form field this editor serialises its Tiptap JSON into. */
  name: string
  initialContent?: JSONContent
  /** Uploads an image file and returns its public URL. Differs between the admin editor (authenticated route) and the public submission form (unauthenticated route). */
  uploadImage: (file: File) => Promise<string>
}

export function StoryEditor({ name, initialContent, uploadImage }: Props) {
  const hiddenRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkValue, setLinkValue] = useState('')
  const [uploading, setUploading] = useState(false)

  const editor = useEditor({
    extensions: STORY_EXTENSIONS,
    content: initialContent ?? EMPTY_DOC,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      if (hiddenRef.current) hiddenRef.current.value = JSON.stringify(editor.getJSON())
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
        if (hiddenRef.current) hiddenRef.current.value = JSON.stringify(editor.getJSON())
      } finally {
        setUploading(false)
      }
    },
    [editor, uploadImage]
  )

  if (!editor) return null

  const toolbarBtn = (active: boolean) =>
    cn(
      'inline-flex h-9 min-w-9 items-center justify-center rounded-md px-2 text-sm text-brand-charcoal transition hover:bg-brand-stone',
      active && 'bg-brand-gold-pale text-brand-gold-deep'
    )

  return (
    <div className="rounded-lg border border-brand-black/15 bg-white">
      <div className="flex flex-wrap items-center gap-1 border-b border-brand-black/10 p-2">
        <button
          type="button"
          className={toolbarBtn(editor.isActive('heading', { level: 2 }))}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          aria-label="Heading"
        >
          <HugeiconsIcon icon={Heading02Icon} className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          className={toolbarBtn(editor.isActive('bold'))}
          onClick={() => editor.chain().focus().toggleBold().run()}
          aria-label="Bold"
        >
          <HugeiconsIcon icon={BoldIcon} className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          className={toolbarBtn(editor.isActive('italic'))}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          aria-label="Italic"
        >
          <HugeiconsIcon icon={ItalicIcon} className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          className={toolbarBtn(editor.isActive('bulletList'))}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          aria-label="Bulleted list"
        >
          <HugeiconsIcon icon={ListViewIcon} className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          className={toolbarBtn(editor.isActive('blockquote'))}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          aria-label="Quote"
        >
          <HugeiconsIcon icon={QuoteUpIcon} className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          className={toolbarBtn(editor.isActive('link'))}
          onClick={() => {
            setLinkValue((editor.getAttributes('link').href as string) ?? '')
            setLinkOpen((v) => !v)
          }}
          aria-label="Link"
        >
          <HugeiconsIcon icon={Link01Icon} className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          className={toolbarBtn(false)}
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          aria-label="Insert image"
        >
          <HugeiconsIcon icon={Image01Icon} className="h-4 w-4" aria-hidden />
        </button>
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
        {uploading && <span className="text-xs text-brand-grey">Uploading…</span>}
      </div>

      {linkOpen && (
        <div className="flex items-center gap-2 border-b border-brand-black/10 p-2">
          <input
            type="url"
            value={linkValue}
            onChange={(e) => setLinkValue(e.target.value)}
            placeholder="https://…"
            className="h-9 flex-1 rounded-md border border-brand-black/15 px-2 text-sm"
          />
          <button
            type="button"
            className="h-9 shrink-0 rounded-md bg-brand-black px-3 text-xs font-semibold text-white"
            onClick={() => {
              if (linkValue) {
                editor.chain().focus().extendMarkRange('link').setLink({ href: linkValue }).run()
              } else {
                editor.chain().focus().unsetLink().run()
              }
              if (hiddenRef.current) hiddenRef.current.value = JSON.stringify(editor.getJSON())
              setLinkOpen(false)
            }}
          >
            Apply
          </button>
        </div>
      )}

      <EditorContent editor={editor} className="story-content min-h-64 px-4 py-3" />
      <input ref={hiddenRef} type="hidden" name={name} defaultValue={JSON.stringify(initialContent ?? EMPTY_DOC)} />
    </div>
  )
}
