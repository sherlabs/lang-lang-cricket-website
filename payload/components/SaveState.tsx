// @committee-facing
'use client'
import { useConfig, useDocumentInfo, useEditDepth, useField, useFormModified, useFormProcessing } from '@payloadcms/ui'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { saveStateLabel } from '../../lib/admin/list-status'

/** "Draft: not on the website yet" for a collection that keeps a draft/published choice in a `status` field (News). */
function DraftHint({ path, liveValue }: { path: string; liveValue: string }) {
  const { value } = useField<string>({ path })
  if (!value) return null
  return <span className="club-savestate__hint">{value === liveValue ? 'On the website' : 'Draft: not on the website yet'}</span>
}

/**
 * Sits next to Payload's own Save button (`edit.beforeDocumentControls`): a "Back to Players" link and one polite status line that says
 * Saving, Unsaved changes or Saved just now. It does not replace the save button, so Cmd/Ctrl+S, the leave-page guard and Payload's
 * validation behave exactly as before. Renders nothing inside a drawer.
 */
export function SaveState({ statusPath, liveValue }: { statusPath?: string; liveValue?: string }) {
  const depth = useEditDepth()
  const { id, collectionSlug, savedDocumentData } = useDocumentInfo()
  const { config, getEntityConfig } = useConfig()
  const modified = useFormModified()
  const processing = useFormProcessing()
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const wasProcessing = useRef(false)

  // "Saved just now" only after a save we watched finish (processing went true then false), never on first load.
  useEffect(() => {
    if (wasProcessing.current && !processing) setLastSavedAt(Date.now())
    wasProcessing.current = processing
  }, [processing])

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 20_000)
    return () => window.clearInterval(t)
  }, [])

  if (depth > 1) return null
  const plural = collectionSlug ? (getEntityConfig({ collectionSlug })?.labels?.plural as unknown) : null
  const label = typeof plural === 'string' ? plural : null
  const text = saveStateLabel({ processing, modified, lastSavedAt, now, isNew: id == null, docUpdatedAt: typeof savedDocumentData?.updatedAt === 'string' ? Date.parse(savedDocumentData.updatedAt) : null })
  return (
    <>
      {collectionSlug && label ? (
        <Link className="club-savestate__back" href={`${config.routes.admin}/collections/${collectionSlug}`}>
          <span aria-hidden="true">←</span>
          <span>
            Back<span className="club-savestate__more"> to {label}</span>
          </span>
        </Link>
      ) : null}
      <span className="club-savestate" role="status" aria-live="polite" data-state={processing ? 'saving' : modified ? 'modified' : 'saved'}>
        {text}
        {statusPath && liveValue ? <DraftHint path={statusPath} liveValue={liveValue} /> : null}
      </span>
    </>
  )
}
