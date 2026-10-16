'use client'

import { Button, toast, useConfig, useDocumentInfo } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

type Tokens = { editToken?: string | null; viewToken?: string | null }

function LinkRow({ label, path }: { label: string; path: string }) {
  const url = typeof window !== 'undefined' ? `${window.location.origin}${path}` : path
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success(`${label} copied`)
    } catch {
      toast.error('Could not copy — select the link and copy it by hand.')
    }
  }
  return (
    <div className="club-link-row">
      <span className="club-link-row__label">{label}</span>
      <input className="club-link-row__input" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
      <Button type="button" size="small" buttonStyle="secondary" onClick={copy}>
        Copy
      </Button>
    </div>
  )
}

/**
 * `stories.fields.submitterLinks` (ui, spec §9): staff-only, read-only copies of the
 * submitter's preview and edit links, so they can be resent (the submitter's only other copy
 * is a cookie). The tokens are hidden fields with staff-only read access; they are fetched for
 * this one document over REST (`select`). Hidden on create.
 */
export function StoryLinksField() {
  const { id } = useDocumentInfo()
  const { config } = useConfig()
  const api = `${config.serverURL ?? ''}${config.routes.api}`
  const [tokens, setTokens] = useState<Tokens | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    const qs = new URLSearchParams({ 'select[editToken]': 'true', 'select[viewToken]': 'true', depth: '0' })
    fetch(`${api}/stories/${id}?${qs}`, { credentials: 'include' })
      .then((res) => (res.ok ? (res.json() as Promise<Tokens>) : null))
      .then((doc) => {
        if (!cancelled) setTokens(doc)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [api, id])

  if (!id || !tokens?.editToken) return null
  return (
    <div className="club-field club-story-links">
      <h3 className="club-field__title">Submitter links</h3>
      <p className="club-muted">Anyone with the edit link can change this story (an edit sends it back to review).</p>
      {tokens.viewToken && <LinkRow label="Preview link" path={`/history/drafts/${tokens.viewToken}`} />}
      <LinkRow label="Edit link" path={`/history/drafts/${tokens.editToken}/edit`} />
    </div>
  )
}
