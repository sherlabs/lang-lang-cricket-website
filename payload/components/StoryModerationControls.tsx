'use client'

import { Button, useDocumentInfo, useForm, useFormFields } from '@payloadcms/ui'
import { useState } from 'react'

type Action = { label: string; status: 'pending' | 'published' | 'rejected'; primary?: boolean; confirm?: string }

const ACTIONS: Record<string, Action[]> = {
  pending: [
    { label: 'Approve', status: 'published', primary: true },
    { label: 'Reject', status: 'rejected', confirm: 'Reject this story? It stays in the list and can be restored to review later.' },
  ],
  published: [{ label: 'Unpublish', status: 'rejected', confirm: 'Unpublish this story? It comes off the history page.' }],
  rejected: [{ label: 'Restore to review', status: 'pending' }],
}

/**
 * `stories.admin.components.edit.beforeDocumentControls` (spec §9). The buttons depend on the
 * saved status: pending → Approve / Reject; published → Unpublish (→ rejected); rejected →
 * Restore to review (→ pending). Each one saves the form with the status override
 * (`useForm().submit({ overrides })`), so unsaved edits go with the status change instead of
 * being discarded by a separate PATCH. `storyLifecycle` stamps publishedAt/reviewedAt.
 */
export function StoryModerationControls() {
  const { id, initialData } = useDocumentInfo()
  const { submit } = useForm()
  const formStatus = useFormFields(([fields]) => fields.status?.initialValue as string | undefined)
  const [busy, setBusy] = useState(false)
  const status = formStatus ?? (initialData?.status as string | undefined)
  const actions = id && status ? (ACTIONS[status] ?? []) : []
  if (!actions.length) return null

  const run = async (action: Action) => {
    if (action.confirm && !window.confirm(action.confirm)) return
    setBusy(true)
    try {
      await submit({ overrides: { status: action.status } })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="club-moderation" role="group" aria-label="Moderation">
      {actions.map((a) => (
        <Button key={a.status} type="button" size="medium" buttonStyle={a.primary ? 'primary' : 'secondary'} disabled={busy} onClick={() => run(a)}>
          {a.label}
        </Button>
      ))}
    </div>
  )
}
