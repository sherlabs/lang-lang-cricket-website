import { SetStepNav } from '@payloadcms/ui'
import type { AdminViewServerProps } from 'payload'
import { parseStockId } from '@/lib/office/stock'
import { getPersonPage } from '@/lib/stock-office-queries'
import { AdminPage, requireStaff } from './AdminPage'
import { Nonce, StatusBadge, StockFlash, first } from './OfficeStockBits'

/**
 * `/admin/office/stock/people/:id` (committee): what one person holds. One tap to return it all, a box for a part return, and a
 * way to mark it lost. The name is a first name and last initial for a junior, and the page shows no contact details.
 */
export async function OfficeStockPersonView(view: AdminViewServerProps) {
  const { req } = view.initPageResult
  const segments = (view.params?.segments as string[] | undefined) ?? []
  const id = parseStockId(segments[segments.length - 1])
  const denied = await requireStaff(view, `/office/stock${id ? `/people/${id}` : ''}`)
  if (denied !== null) return denied
  const admin = req.payload.config.routes.admin
  const api = `${req.payload.config.routes.api}/admin/office/stock`
  const sp = view.searchParams ?? {}
  const page = id ? await getPersonPage(req.user, id) : null
  const base = `${admin}/office/stock`
  if (!page) {
    return (
      <AdminPage view={view}>
        <SetStepNav nav={[{ label: 'Club office', url: `${admin}/office` }, { label: 'Stock', url: base }, { label: 'Not found' }]} />
        <h1 className="club-page__title">Person not found</h1>
        <p><a href={base}>Back to Stock</a></p>
      </AdminPage>
    )
  }
  const ret = `/office/stock/people/${page.memberId}`

  return (
    <AdminPage view={view}>
      <SetStepNav nav={[{ label: 'Club office', url: `${admin}/office` }, { label: 'Stock', url: base }, { label: page.person }]} />
      <h1 className="club-page__title">{page.person}</h1>
      <p className="club-page__lead">Kit this person has borrowed from the club.</p>
      <StockFlash notice={first(sp.notice)} error={first(sp.error)} n={first(sp.n)} />

      <h2 className="club-page__subtitle">Holding now</h2>
      {page.held.length === 0 ? (
        <p className="club-attention__none">Nothing is out with this person.</p>
      ) : (
        <ul className="office-list">
          {page.held.map((h) => (
            <li key={h.issueId}>
              <p>
                <a href={`${base}/item/${h.itemId}`}><strong>{h.item}</strong></a>: {h.owed} {h.owed < h.qty ? `of ${h.qty} ` : ''}out since {h.issuedOn}
                {h.dueBackOn ? `, due back ${h.dueBackOn}` : ', no due date'} <StatusBadge status={h.status} overdue={h.overdue} days={h.daysOverdue} />
              </p>
              <form method="post" action={`${api}/return`} className="office-inline">
                <input type="hidden" name="return" value={ret} />
                <Nonce />
                <input type="hidden" name="issue" value={h.issueId} />
                <label>
                  How many are back
                  <input name="qty" defaultValue={h.owed} required inputMode="numeric" pattern="[0-9]*" maxLength={6} aria-label={`How many of ${h.item} are back`} />
                </label>
                <button type="submit" className="btn btn--style-primary btn--size-medium" aria-label={`Return ${h.item}`}>Returned</button>
              </form>
              <details className="office-void">
                <summary aria-label={`Mark ${h.item} as lost`}>Lost instead</summary>
                <form method="post" action={`${api}/lost`} className="office-inline">
                  <input type="hidden" name="return" value={ret} />
                  <Nonce />
                  <input type="hidden" name="issue" value={h.issueId} />
                  <label>
                    How many are lost
                    <input name="qty" defaultValue={h.owed} required inputMode="numeric" pattern="[0-9]*" maxLength={6} />
                  </label>
                  <label>
                    Note (optional)
                    <input name="note" maxLength={300} />
                  </label>
                  <button type="submit" className="btn btn--style-secondary btn--size-medium">Mark as lost</button>
                </form>
              </details>
            </li>
          ))}
        </ul>
      )}

      {page.history.length > 0 ? (
        <>
          <h2 className="club-page__subtitle">Earlier</h2>
          <ul className="office-list">
            {page.history.map((h) => (
              <li key={h.issueId}>
                <a href={`${base}/item/${h.itemId}`}>{h.item}</a>: {h.qty} on {h.issuedOn} <StatusBadge status={h.status} />
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </AdminPage>
  )
}
