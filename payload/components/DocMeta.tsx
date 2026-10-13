// @committee-facing
'use client'
import { useDocumentInfo } from '@payloadcms/ui'

const fmt = (v: unknown) => {
  const d = typeof v === 'string' ? new Date(v) : null
  return d && !Number.isNaN(d.getTime()) ? new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' }).format(d) : null
}

/** "Last changed" and "Added" lines, shown inside the Details area instead of the crowded top bar. */
export function DocMeta() {
  const { savedDocumentData } = useDocumentInfo()
  const changed = fmt(savedDocumentData?.updatedAt)
  const added = fmt(savedDocumentData?.createdAt)
  if (!changed && !added) return null
  return (
    <dl className="club-docmeta">
      {added ? (
        <>
          <dt>Added</dt>
          <dd>{added}</dd>
        </>
      ) : null}
      {changed ? (
        <>
          <dt>Last changed</dt>
          <dd>{changed}</dd>
        </>
      ) : null}
    </dl>
  )
}
