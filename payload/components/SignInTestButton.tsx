'use client'

import { Button, toast } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Check = { name: string; ok: boolean; text: string }
type Result = { ok: boolean; summary: string; checks: Check[] }

/** "Test connection" on Site settings > Sign-in: POSTs /api/admin/signin/test (admin only), shows each check, refreshes the status. */
export function SignInTestButton() {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  const run = async () => {
    setPending(true)
    try {
      const res = await fetch('/api/admin/signin/test', { method: 'POST', credentials: 'include' })
      if (res.status === 401 || res.status === 403) throw new Error('Only a site admin can run this check.')
      const json = (await res.json().catch(() => null)) as Result | null
      if (!json) throw new Error(`The check failed (${res.status}).`)
      setResult(json)
      if (json.ok) toast.success(json.summary)
      else toast.error(json.summary)
    } catch (err) {
      toast.error((err as Error).message || 'The check failed.')
    } finally {
      setPending(false)
      router.refresh()
    }
  }

  return (
    <div className="club-signin__test">
      <Button buttonStyle="secondary" disabled={pending} onClick={run} type="button">
        {pending ? 'Checking…' : 'Test connection'}
      </Button>
      <div aria-live="polite">
        {result && (
          <ul className="club-signin__checks">
            {result.checks.map((c) => (
              <li key={c.name}>
                <span className={`club-pill club-pill--${c.ok ? 'ok' : 'error'}`}>{c.ok ? 'OK' : 'Problem'}</span> {c.text}
              </li>
            ))}
            {result.checks.length === 0 && <li>{result.summary}</li>}
          </ul>
        )}
      </div>
    </div>
  )
}
