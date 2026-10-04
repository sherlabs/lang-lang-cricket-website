'use client'

import { Button, toast } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export type SelectorRow = { id: number; name: string; email: string; status: string; statusLabel: string; facebookLinked: boolean; lastSignIn: string | null }
type Invite = { name: string; url: string; days: number }

/**
 * Selector logins (spec 3.4): add one, share the one-time invite link (shown once), and per row: new invite link, unlink Facebook,
 * disable or enable, set a password, remove. Every button posts to `/api/selectors/*`, where the real access rules live.
 */
export function SelectorsPanel({ api, rows, facebookOn, inviteDays }: { api: string; rows: SelectorRow[]; facebookOn: boolean; inviteDays?: number }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [invite, setInvite] = useState<Invite | null>(null)
  const [passwordFor, setPasswordFor] = useState<number | null>(null)
  const [password, setPassword] = useState('')
  const days = inviteDays ?? 14

  const post = async (path: string, body: unknown) => {
    const res = await fetch(`${api}/selectors/${path}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (!res.ok) throw new Error((json?.errors as { message: string }[] | undefined)?.[0]?.message ?? `That did not work (${res.status}).`)
    return json ?? {}
  }
  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const add = (e: React.FormEvent) => {
    e.preventDefault()
    void run(async () => {
      const json = await post('create', { name, email })
      setInvite({ name, url: json.inviteUrl as string, days })
      setName('')
      setEmail('')
      router.refresh()
    })
  }
  const newInvite = (r: SelectorRow) =>
    run(async () => {
      const json = await post('invite', { id: r.id })
      setInvite({ name: r.name || r.email, url: json.inviteUrl as string, days })
      router.refresh()
    })
  const simple = (path: string, r: SelectorRow, done: string, confirm?: string) => {
    if (confirm && !window.confirm(confirm)) return
    void run(async () => {
      await post(path, { id: r.id })
      toast.success(done)
      router.refresh()
    })
  }
  const savePassword = (r: SelectorRow) =>
    run(async () => {
      await post('set-password', { id: r.id, password })
      toast.success(`A new password is set for ${r.name || r.email}. Tell them in person or by phone, not in a group chat.`)
      setPasswordFor(null)
      setPassword('')
    })

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Link copied.')
    } catch {
      toast.error('Could not copy. Select the link and copy it by hand.')
    }
  }
  const message = invite ? `Hi ${invite.name.split(/\s+/)[0]}, here is your link to pick the teams: ${invite.url}` : ''

  return (
    <div className="club-stack">
      <form className="club-panel" onSubmit={add}>
        <h2 className="club-field__title">Add a selector</h2>
        <p className="club-muted">The email is only their login name. It is not used to match Facebook.</p>
        <div className="club-actions">
          <label>
            <span className="club-muted">Name</span>
            <br />
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoComplete="off" />
          </label>
          <label>
            <span className="club-muted">Email</span>
            <br />
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" />
          </label>
          <Button buttonStyle="primary" type="submit" disabled={busy}>Add selector</Button>
        </div>
      </form>

      {invite && (
        <div className="club-panel" role="status">
          <h2 className="club-field__title">Invite link for {invite.name}</h2>
          <p>Send this to {invite.name}. It opens the selector tools and lets them sign in{facebookOn ? ' with Facebook' : ''} or choose a password. It works for {invite.days} days and once. It is shown only now.</p>
          <p><input type="text" readOnly value={invite.url} onFocus={(e) => e.currentTarget.select()} style={{ width: '100%' }} aria-label="Invite link" /></p>
          <div className="club-actions">
            <Button buttonStyle="primary" size="small" type="button" onClick={() => copy(invite.url)}>Copy link</Button>
            <a className="club-button-link" href={`sms:?&body=${encodeURIComponent(message)}`}>Share by text message</a>
            <a className="club-button-link" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">Share on WhatsApp</a>
            <Button buttonStyle="secondary" size="small" type="button" onClick={() => setInvite(null)}>Done</Button>
          </div>
        </div>
      )}

      <h2 className="club-field__title">Selectors ({rows.length})</h2>
      {rows.length === 0 ? (
        <p className="club-attention__none">No selectors yet. Add the first one above.</p>
      ) : (
        <table className="club-table">
          <thead><tr><th>Who</th><th>Status</th><th>Last signed in</th><th aria-label="Actions" /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><p className="club-table__strong">{r.name || r.email}</p><p className="club-muted">{r.email}</p></td>
                <td>{r.statusLabel}{r.facebookLinked ? ' · Facebook linked' : ''}</td>
                <td>{r.lastSignIn ?? 'Not yet'}</td>
                <td>
                  <div className="club-actions">
                    <Button buttonStyle="secondary" size="small" type="button" disabled={busy} onClick={() => newInvite(r)}>New invite link</Button>
                    {r.facebookLinked && <Button buttonStyle="secondary" size="small" type="button" disabled={busy} onClick={() => simple('unlink', r, 'Facebook unlinked. Send a new invite link if they should link it again.', `Unlink Facebook for ${r.name || r.email}? They can still sign in with a password.`)}>Unlink Facebook</Button>}
                    {r.status === 'disabled' ? (
                      <Button buttonStyle="secondary" size="small" type="button" disabled={busy} onClick={() => simple('enable', r, 'Enabled.')}>Enable</Button>
                    ) : (
                      <Button buttonStyle="secondary" size="small" type="button" disabled={busy} onClick={() => simple('disable', r, 'Disabled. They are signed out.', `Disable ${r.name || r.email}? They are signed out straight away.`)}>Disable</Button>
                    )}
                    <Button buttonStyle="secondary" size="small" type="button" disabled={busy} onClick={() => { setPasswordFor(passwordFor === r.id ? null : r.id); setPassword('') }}>Set a password</Button>
                    <Button buttonStyle="secondary" size="small" type="button" disabled={busy} onClick={() => simple('remove', r, 'Removed.', `Remove ${r.name || r.email}? This deletes their login.`)}>Remove</Button>
                  </div>
                  {passwordFor === r.id && (
                    <form className="club-actions" onSubmit={(e) => { e.preventDefault(); void savePassword(r) }}>
                      <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} minLength={10} required placeholder="At least 10 characters" aria-label={`New password for ${r.name || r.email}`} autoComplete="off" />
                      <Button buttonStyle="primary" size="small" type="submit" disabled={busy}>Save password</Button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
