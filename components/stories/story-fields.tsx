'use client'

import { useRef, useState } from 'react'
import type { JSONContent } from '@tiptap/core'
import { HugeiconsIcon } from '@hugeicons/react'
import { UserIcon, ImageAdd01Icon, Camera01Icon } from '@hugeicons/core-free-icons'
import { StoryEditor } from '@/components/stories/story-editor'
import { optimiseImage } from '@/lib/blob-client'

type Props = {
  initialTitle?: string
  initialAuthorName?: string
  initialAuthorEmail?: string
  initialCoverUrl?: string
  initialContent?: JSONContent
  uploadCover: (file: File) => Promise<string>
  uploadEditorImage: (file: File) => Promise<string>
  /** Only the fresh public submission form needs the honeypot — an edit reached via a secret link isn't the same spam surface. */
  showHoneypot?: boolean
}

/** Cover image, title, byline and body editor shared by the public submission form and the token-authed draft editor. */
export function StoryFields({
  initialTitle = '',
  initialAuthorName = '',
  initialAuthorEmail = '',
  initialCoverUrl = '',
  initialContent,
  uploadCover,
  uploadEditorImage,
  showHoneypot = false,
}: Props) {
  const coverInputRef = useRef<HTMLInputElement>(null)
  const [coverUrl, setCoverUrl] = useState(initialCoverUrl)
  const [coverBusy, setCoverBusy] = useState(false)

  async function onCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCoverBusy(true)
    try {
      const prepared = await optimiseImage(file, { maxEdge: 1600 })
      setCoverUrl(await uploadCover(prepared))
    } finally {
      setCoverBusy(false)
    }
  }

  return (
    <>
      {coverUrl ? (
        <div className="group relative -mx-5 mb-8 overflow-hidden sm:mx-0 sm:rounded-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={coverUrl} alt="" className="aspect-[2/1] w-full object-cover" />
          <button
            type="button"
            disabled={coverBusy}
            onClick={() => coverInputRef.current?.click()}
            className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-brand-black/80 px-3 py-1.5 text-xs font-semibold text-white shadow-card backdrop-blur transition hover:bg-brand-black disabled:opacity-60"
          >
            <HugeiconsIcon icon={Camera01Icon} className="h-3.5 w-3.5" aria-hidden />
            {coverBusy ? 'Uploading…' : 'Change cover'}
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={coverBusy}
          onClick={() => coverInputRef.current?.click()}
          className="mb-8 flex w-full items-center gap-4 rounded-xl border border-dashed border-brand-black/20 bg-brand-stone/60 px-5 py-4 text-left transition hover:border-brand-gold hover:bg-brand-gold-pale/40 disabled:opacity-60"
        >
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-brand-gold-deep shadow-card">
            <HugeiconsIcon icon={ImageAdd01Icon} className="h-5 w-5" aria-hidden />
          </span>
          <span className="flex flex-col">
            <span className="text-sm font-semibold text-brand-black">{coverBusy ? 'Uploading…' : 'Add a cover image'}</span>
            <span className="text-xs text-brand-grey">Optional. An old photo or a team shot works well.</span>
          </span>
        </button>
      )}
      <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={onCoverChange} />
      <input type="hidden" name="coverImageUrl" value={coverUrl} readOnly />

      <input
        type="text"
        name="title"
        defaultValue={initialTitle}
        required
        placeholder="Title"
        className="story-title-input"
        aria-label="Title"
      />

      <div className="mt-5 flex items-start gap-3 border-b border-brand-black/10 pb-6">
        <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-stone text-brand-grey" aria-hidden>
          <HugeiconsIcon icon={UserIcon} className="h-5 w-5" />
        </span>
        <div className="grid min-w-0 flex-1 gap-x-6 gap-y-1 sm:grid-cols-2">
          <label className="flex flex-col">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-grey-light">Written by</span>
            <input
              type="text"
              name="authorName"
              defaultValue={initialAuthorName}
              required
              placeholder="Your name"
              className="story-byline-input text-base font-medium"
            />
          </label>
          <label className="flex flex-col">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-grey-light">
              Email <span className="font-normal normal-case tracking-normal">(optional, not published)</span>
            </span>
            <input
              type="email"
              name="authorEmail"
              defaultValue={initialAuthorEmail}
              placeholder="you@example.com"
              className="story-byline-input text-sm"
            />
          </label>
        </div>
      </div>

      <StoryEditor name="contentJson" initialContent={initialContent} uploadImage={uploadEditorImage} />

      {showHoneypot && (
        // Hidden from real visitors via CSS, not `type="hidden"`, so form-filling bots that target visible inputs still fill it.
        <div aria-hidden className="absolute -left-[9999px]" tabIndex={-1}>
          <label htmlFor="submit-website">Website</label>
          <input id="submit-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>
      )}
    </>
  )
}
