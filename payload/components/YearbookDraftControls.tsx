'use client'

import { Button, toast, useConfig, useDocumentInfo, useField } from '@payloadcms/ui'
import { useState } from 'react'

/**
 * "Draft a season summary" (W2 spec 6.5). Puts AI-written text into the summary field of the form; nothing is saved until the
 * person saves, and the yearbook cannot be published until the text is ticked as read. The text is marked as an AI-assisted draft.
 */
export function YearbookDraftControls({ configured }: { configured: boolean }) {
  const { id } = useDocumentInfo()
  const { config } = useConfig()
  const summary = useField<string>({ path: 'seasonSummary' })
  const ai = useField<boolean>({ path: 'seasonSummaryAi' })
  const checked = useField<boolean>({ path: 'seasonSummaryChecked' })
  const [pending, setPending] = useState(false)

  const draft = async () => {
    if (!id) return void toast.error('Save the yearbook first, then ask for a draft.')
    if (summary.value?.trim() && !window.confirm('This replaces the summary in the box with a new AI draft. Continue?')) return
    setPending(true)
    try {
      const res = await fetch(`${config.routes.api}/yearbooks/${id}/draft-summary`, { method: 'POST', credentials: 'include' })
      const body = (await res.json().catch(() => null)) as { text?: string; errors?: { message: string }[] } | null
      if (!res.ok || !body?.text) throw new Error(body?.errors?.[0]?.message ?? `The draft could not be made (${res.status}).`)
      summary.setValue(body.text)
      ai.setValue(true)
      checked.setValue(false)
      toast.success('Draft added below. Read it, correct it, then tick the box and save.')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setPending(false)
    }
  }

  const discard = () => {
    summary.setValue('')
    ai.setValue(false)
    checked.setValue(false)
  }

  return (
    <div className="club-field">
      <h3 className="club-field__title">Season summary draft</h3>
      <p className="club-muted">
        The AI writes a first draft from this season&apos;s published results, leaders and honours. It only describes those facts, can still be wrong, and is never published by itself.
      </p>
      <div className="club-actions">
        <Button buttonStyle="primary" disabled={!configured || pending} onClick={draft} type="button">
          {pending ? 'Drafting…' : 'Draft a season summary'}
        </Button>
        {ai.value && (
          <Button buttonStyle="secondary" disabled={pending} onClick={discard} type="button">
            Discard AI draft
          </Button>
        )}
      </div>
      {!configured && <p className="club-muted">AI drafting is not set up on this site.</p>}
      {ai.value && <p role="status"><strong>AI-assisted draft, please check.</strong> Read it, correct it and tick the box before publishing.</p>}
    </div>
  )
}
