import { SetStepNav } from '@payloadcms/ui'
import { notFound } from 'next/navigation'
import type { AdminViewServerProps } from 'payload'
import { CLUB_LOCALE, CLUB_TIMEZONE } from '@/config/site'
import { getEmailOverview } from '@/lib/email-office-queries'
import { SEGMENTS, SEGMENT_LABELS } from '@/lib/email/audience'
import { emailEnabled } from '@/lib/email/env'
import { EMAIL_ERROR_TEXT, EMAIL_NOTICE_TEXT, isEmailError, isEmailNotice } from '@/lib/email/flash'
import { MEMBER_ROLES, ROLE_LABELS } from '@/lib/office/members'
import { isAdminUser } from '../access'
import { AdminPage, requireUser } from './AdminPage'

const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''))
export const STATUS_WORDS = { draft: 'Draft', sending: 'Sending', sent: 'Sent', cancelled: 'Stopped' } as const
const REASON_WORDS: Record<string, string> = { unsubscribed: 'Unsubscribed', manual: 'Added by an admin', bounced: 'Bounced', complaint: 'Complaint' }
const when = (iso: string | null): string => (iso ? new Date(iso).toLocaleString(CLUB_LOCALE, { timeZone: CLUB_TIMEZONE, day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '')

/** The compose fields, shared by the new-email form and the draft editor. */
const pageHref = (q: string, page: number) => `?${new URLSearchParams({ ...(q ? { q } : {}), page: String(page) }).toString()}`

export function ComposeFields({ subject = '', body = '', status = 'active', role = '', juniors = false, segment = '' }: { subject?: string; body?: string; status?: string; role?: string; juniors?: boolean; segment?: string }) {
  return (
    <>
      <label>
        Subject
        <input name="subject" required maxLength={150} defaultValue={subject} />
      </label>
      <label>
        Message
        <textarea name="body" required rows={10} maxLength={20000} defaultValue={body} style={{ font: 'inherit', padding: '0.5rem 0.75rem', border: '1px solid var(--theme-elevation-250)', borderRadius: '0.375rem' }} />
        <span className="club-muted">Plain text. A blank line starts a new paragraph. Use {'{firstName|there}'} for their first name, {'{clubName}'} and {'{volunteerLink}'} (their own volunteer page).</span>
      </label>
      <fieldset>
        <legend>Who it goes to</legend>
        <label>
          Members
          <select name="status" defaultValue={status}>
            <option value="active">Current members</option>
            <option value="past">Past members</option>
            <option value="any">All members</option>
          </select>
        </label>
        <label>
          Role
          <select name="role" defaultValue={role}>
            <option value="">Any role</option>
            {MEMBER_ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
        </label>
        <label>
          Group
          <select name="segment" defaultValue={segment}>
            <option value="">Everyone matching the above</option>
            {SEGMENTS.map((s) => (
              <option key={s} value={s}>{SEGMENT_LABELS[s]}</option>
            ))}
          </select>
        </label>
        <label className="office-check">
          <input type="checkbox" name="juniors" defaultChecked={juniors} />
          Juniors only (a junior without an email goes to their parent or guardian)
        </label>
      </fieldset>
    </>
  )
}

/**
 * `/admin/office/email` (custom view, admin only, and only when email is switched on; otherwise the not-found page): write a new email,
 * see the ones already written, and manage the do-not-email list. Every action is a plain form posted to the email routes.
 */
export async function OfficeEmailView(view: AdminViewServerProps) {
  if (!emailEnabled()) notFound()
  requireUser(view, '/office/email')
  const { req } = view.initPageResult
  const admin = req.payload.config.routes.admin
  const api = `${req.payload.config.routes.api}/admin/office/email`
  if (!isAdminUser(req.user)) {
    return (
      <AdminPage view={view}>
        <h1 className="club-page__title">Email</h1>
        <p className="club-page__lead">Only admins can send club emails.</p>
      </AdminPage>
    )
  }
  const overview = await getEmailOverview(req.user, { query: first(view.searchParams?.q), page: Number(first(view.searchParams?.page)) || 1 })
  if (!overview) notFound()
  const sp = view.searchParams ?? {}
  const notice = first(sp.notice)
  const error = first(sp.error)

  return (
    <AdminPage view={view}>
      <SetStepNav nav={[{ label: 'Club office', url: `${admin}/office` }, { label: 'Email' }]} />
      <h1 className="club-page__title">Email</h1>
      <p className="club-page__lead">Write to your members. Each person gets their own copy with a link to unsubscribe. Emails are sent from {overview.fromAddress}.</p>
      {!overview.providerLive ? <p className="office-flash">Test mode: nothing is delivered. Each email is printed in the server log instead.</p> : null}
      <div role="status" aria-live="polite">
        {isEmailNotice(notice) ? <p className="office-flash office-flash--ok">{EMAIL_NOTICE_TEXT[notice]}</p> : null}
        {isEmailError(error) ? <p className="office-flash office-flash--error">{EMAIL_ERROR_TEXT[error]}</p> : null}
      </div>

      <details className="office-box" open={overview.campaigns.length === 0}>
        <summary>Write a new email</summary>
        <form method="post" action={`${api}/new`} className="office-form">
          <ComposeFields />
          <button type="submit" className="btn btn--style-primary btn--size-medium">Save draft and check it</button>
        </form>
      </details>

      <h2>Your emails</h2>
      {overview.campaigns.length === 0 ? (
        <p className="club-muted">No emails yet.</p>
      ) : (
        <ul className="diary-list">
          {overview.campaigns.map((c) => (
            <li key={c.id} className="diary-job">
              <p className="diary-job__title">
                <span className="office-badge">{STATUS_WORDS[c.status]}</span> <a href={`${admin}/office/email/${c.id}`}><strong>{c.subject}</strong></a>
              </p>
              <p className="club-muted">
                {c.status === 'draft' ? `Written ${when(c.createdAt)}` : `${c.sent} sent, ${c.queued} waiting, ${c.failed} failed, ${c.skipped} skipped`}
                {c.sentAt ? `. Finished ${when(c.sentAt)}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}

      <h2>Not getting emails</h2>
      <p className="club-muted">People who unsubscribed, and addresses you have added. They are skipped every time, even if they are in a group you pick. {overview.suppressionTotal} in total.</p>
      <form method="post" action={`${api}/suppression/add`} className="office-inline">
        <label>
          <span className="club-muted">Add an address</span>
          <input name="email" type="email" required maxLength={254} autoComplete="off" />
        </label>
        <button type="submit" className="btn btn--style-secondary btn--size-medium">Do not email this address</button>
      </form>
      <form method="get" className="office-inline" role="search">
        <label>
          <span className="club-muted">Find an address</span>
          <input name="q" type="search" defaultValue={overview.suppressionQuery} maxLength={100} autoComplete="off" />
        </label>
        <button type="submit" className="btn btn--style-secondary btn--size-medium">Search</button>
      </form>
      {overview.suppressions.length === 0 && overview.suppressionQuery ? <p className="club-muted">No address on the list matches that.</p> : null}
      {overview.suppressions.length > 0 ? (
        <ul className="diary-list">
          {overview.suppressions.map((s) => (
            <li key={s.id} className="diary-job">
              <p className="diary-job__title">
                <strong>{s.email ?? 'Address no longer kept'}</strong> <span className="office-badge">{REASON_WORDS[s.reason] ?? s.reason}</span>
              </p>
              <p className="club-muted">{when(s.at)}</p>
              <form method="post" action={`${api}/suppression/remove`} className="office-inline">
                <input type="hidden" name="id" value={s.id} />
                <button type="submit" aria-label={`Allow emails to ${s.email ?? 'this address'} again`} className="btn btn--style-secondary btn--size-medium">Allow emails again</button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}
      {overview.suppressionPages > 1 ? (
        <p className="club-muted">
          Page {overview.suppressionPage} of {overview.suppressionPages}.{' '}
          {overview.suppressionPage > 1 ? <a href={pageHref(overview.suppressionQuery, overview.suppressionPage - 1)}>Earlier</a> : null}{' '}
          {overview.suppressionPage < overview.suppressionPages ? <a href={pageHref(overview.suppressionQuery, overview.suppressionPage + 1)}>Later</a> : null}
        </p>
      ) : null}
    </AdminPage>
  )
}
