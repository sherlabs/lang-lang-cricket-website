'use client'

import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Copy01Icon, CheckmarkCircle01Icon } from '@hugeicons/core-free-icons'

type Props = {
  editToken: string
  viewToken?: string
}

function CopyRow({ label, hint, path }: { label: string; hint: string; path: string }) {
  const [copied, setCopied] = useState(false)
  const url = typeof window !== 'undefined' ? `${window.location.origin}${path}` : path

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API unavailable — the link is still selectable/visible below.
    }
  }

  return (
    <div className="rounded-xl border border-brand-black/10 bg-white p-4">
      <p className="text-sm font-semibold text-brand-black">{label}</p>
      <p className="mt-0.5 text-xs text-brand-grey">{hint}</p>
      <div className="mt-3 flex items-center gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
          className="h-10 flex-1 truncate rounded-lg border border-brand-black/10 bg-brand-stone/60 px-3 text-sm text-brand-charcoal"
        />
        <button
          type="button"
          onClick={copy}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-brand-black px-3 text-sm font-semibold text-white transition hover:bg-brand-charcoal"
        >
          <HugeiconsIcon icon={copied ? CheckmarkCircle01Icon : Copy01Icon} className="h-4 w-4" aria-hidden />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

/** Shown once, right after a submission — these links aren't stored anywhere the submitter can look them up again. */
export function DraftLinks({ editToken, viewToken }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-brand-grey">
        Save these links — they&apos;re the only way to get back to this story. Nobody else can find or edit it
        without them.
      </p>
      <CopyRow
        label="Edit link"
        hint="Lets you come back and change this story, any time."
        path={`/history/drafts/${editToken}/edit`}
      />
      {viewToken && (
        <CopyRow
          label="Preview link"
          hint="Share this with anyone you want to see the story before it's approved. They can't edit it."
          path={`/history/drafts/${viewToken}`}
        />
      )}
    </div>
  )
}
