// @committee-facing
import { SetStepNav } from '@payloadcms/ui'
import { notFound } from 'next/navigation'
import type { AdminViewServerProps } from 'payload'
import { getCampaignPage, parseCampaignId } from '@/lib/email-office-queries'
import { emailEnabled, emailLimits, sendEstimate } from '@/lib/email/env'
import { EMAIL_ERROR_TEXT, EMAIL_NOTICE_TEXT, isEmailError, isEmailNotice } from '@/lib/email/flash'
import { isAdminUser } from '../access'
import { AdminPage, requireStaff } from './AdminPage'
import { ComposeFields, STATUS_WORDS } from './OfficeEmailView'
import { EmailSendProgress } from './EmailSendProgress'
import { EmptyState, LinkButton, PageHeader } from './ui'

const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''))

/**
 * `/admin/office/email/:id`: one email. A draft shows the editor, a preview with a sample first name, the counts of who would get
 * it and a single confirm step. A sending email shows progress and a stop button. A finished one shows what happened.
 */
export async function OfficeEmailCampaignView(view: AdminViewServerProps) {
  if (!emailEnabled()) notFound()
  const denied = await requireStaff(view, '/office/email')
  if (denied !== null) return denied
  const { req } = view.initPageResult
  const admin = req.payload.config.routes.admin
  const apiRoot = req.payload.config.routes.api
  if (!isAdminUser(req.user)) {
    return (
      <AdminPage view={view}>
        <PageHeader title="Email" lead={<>Only admins can send club emails.</>} />
      </AdminPage>
    )
  }
  const segments = (view.params?.segments as string[] | undefined) ?? []
  const id = parseCampaignId(segments[segments.length - 1])
  const page = id === null ? null : await getCampaignPage(req.user, id)
  if (!page) {
    return (
      <AdminPage view={view}>
        <PageHeader title="Email not found" lead={<>That email does not exist any more.</>} />
        <EmptyState icon="announcements" action={<LinkButton variant="secondary" href={`${admin}/office/email`}>Back to Email</LinkButton>}>Pick one from the list of emails.</EmptyState>
      </AdminPage>
    )
  }
  const api = `${apiRoot}/admin/office/email/${page.id}`
  const sp = view.searchParams ?? {}
  const notice = first(sp.notice)
  const error = first(sp.error)
  const total = page.counts.queued + page.counts.sent + page.counts.failed + page.counts.skipped
  const will = page.audienceCounts?.willReceive ?? 0
  const pace = emailLimits().ratePerSecond
  const estimate = sendEstimate(will, pace)
  const leftEstimate = sendEstimate(page.counts.queued, pace)

  return (
    <AdminPage view={view}>
      <SetStepNav nav={[{ label: 'Club office', url: `${admin}/office` }, { label: 'Email', url: `${admin}/office/email` }, { label: page.subject }]} />
      <PageHeader title={<>{page.subject}</>} lead={<><span className="ui-pill ui-pill--neutral">{STATUS_WORDS[page.status]}</span></>} />
      <div role="status" aria-live="polite">
        {isEmailNotice(notice) ? <p className="office-flash office-flash--ok">{EMAIL_NOTICE_TEXT[notice]}</p> : null}
        {isEmailError(error) ? <p className="office-flash office-flash--error">{EMAIL_ERROR_TEXT[error]}</p> : null}
      </div>
      {!page.adapterLive ? <p className="office-flash">Test mode: nothing is delivered. Each email is printed in the server log instead.</p> : null}

      {page.status === 'sending' ? (
        <section className="office-box" aria-labelledby="progress">
          <h2 id="progress">Sending</h2>
          <EmailSendProgress endpoint={`${api}/batch`} total={total} queued={page.counts.queued} />
          <p className="club-muted">{page.counts.sent} sent, {page.counts.queued} waiting, {page.counts.failed} failed, {page.counts.skipped} skipped (unsubscribed or asked not to be emailed).</p>
          <p className="club-muted">
            Keep this page open until it finishes: sending pauses when the tab is in the background or closed, and on a phone as soon as the screen locks. Left alone, the scheduled run sends only about {leftEstimate.perRun} a day{leftEstimate.overOneRun ? `, so the ${page.counts.queued} still waiting would take about ${leftEstimate.days} days` : ''}. Press Continue sending to carry on.
          </p>
          <form method="post" action={`${api}/continue`} className="office-inline">
            <button type="submit" className="ui-btn ui-btn--primary">Continue sending</button>
          </form>
          <form method="post" action={`${api}/stop`} className="office-inline">
            <button type="submit" className="ui-btn ui-btn--secondary">Stop sending</button>
          </form>
        </section>
      ) : null}

      {page.status === 'sent' || page.status === 'cancelled' ? (
        <section className="office-box" aria-labelledby="result">
          <h2 id="result">{page.status === 'sent' ? 'Finished' : 'Stopped'}</h2>
          <p>{page.counts.sent} sent, {page.counts.failed} failed, {page.counts.skipped} skipped{page.status === 'cancelled' ? `, ${page.counts.queued} not sent` : ''}.</p>
          <p className="club-muted">{page.purged ? 'The addresses kept for this email have been removed. The counts stay.' : 'The addresses kept for this email are removed automatically after the retention period set in Club office settings. The counts stay.'}</p>
        </section>
      ) : null}

      {page.status === 'draft' ? (
        <>
          <section className="office-box" aria-labelledby="edit">
            <h2 id="edit">Write it</h2>
            <form method="post" action={`${api}/save`} className="office-form">
              <ComposeFields subject={page.subject} body={page.body} status={page.audience.status ?? 'any'} role={page.audience.role ?? ''} juniors={page.audience.juniors} segment={page.audience.segment ?? ''} />
              <button type="submit" className="ui-btn ui-btn--primary">Save changes</button>
            </form>
          </section>

          <section className="office-box" aria-labelledby="preview">
            <h2 id="preview">What people will see</h2>
            <p className="club-muted">Shown with the sample first name Sam. Each person gets their own name and their own unsubscribe link.</p>
            <p><strong>Subject:</strong> {page.preview.subject}</p>
            {page.preview.html ? <iframe title="Email preview" sandbox="" srcDoc={page.preview.html} style={{ width: '100%', minHeight: '28rem', border: '1px solid var(--theme-elevation-150)', background: 'var(--theme-elevation-0)' }} /> : <p className="club-muted">The preview is not available until the message is fixed.</p>}
          </section>

          <section className="office-box" aria-labelledby="send">
            <h2 id="send">Check and send</h2>
            {page.sentence ? <p>{page.sentence}.</p> : null}
            {page.overCap ? <p className="office-flash office-flash--error">That is more than {page.maxRecipients} people, the most this site will send to in one go. Narrow who it goes to.</p> : null}
            <form method="post" action={`${api}/test`} className="office-inline">
              <button type="submit" className="ui-btn ui-btn--secondary">Send me a copy first</button>
            </form>
            {will > 0 && !page.overCap ? (
              <form method="post" action={`${api}/send`} className="office-form">
                <input type="hidden" name="expected" value={will} />
                <p className="club-muted">
                  Sending runs at about {pace} per second, so this takes roughly {estimate.minutesOpen} {estimate.minutesOpen === 1 ? 'minute' : 'minutes'} with this page open. If you close it, the scheduled run sends only about {estimate.perRun} a day.
                </p>
                {estimate.overOneRun ? (
                  <p className="office-flash office-flash--error">
                    That is more than one scheduled run can send, so if the page is closed this would take about {estimate.days} days. Stay on this page (keep the screen awake) until it finishes, or come back and press Continue sending.
                  </p>
                ) : null}
                <p>
                  You are about to send <strong>“{page.subject}”</strong> to <strong>{will} {will === 1 ? 'person' : 'people'}</strong>. This cannot be taken back.
                </p>
                <button type="submit" className="ui-btn ui-btn--primary">Yes, send to {will} {will === 1 ? 'person' : 'people'}</button>
              </form>
            ) : (
              <p className="club-muted">Nobody would get this email yet. Change who it goes to.</p>
            )}
          </section>
        </>
      ) : null}
    </AdminPage>
  )
}
