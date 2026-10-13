import { SetStepNav } from '@payloadcms/ui'
import type { AdminViewServerProps } from 'payload'
import { parseWholeQty } from '@/lib/office/stock'
import { getStocktakePage } from '@/lib/stock-office-queries'
import { AdminPage, requireStaff } from './AdminPage'
import { Nonce, StockFlash, first } from './OfficeStockBits'

/**
 * `/admin/office/stock/stocktake` (committee): type what you counted, see the differences, then post them as adjustments. The
 * review is a plain GET with the counts in the address, so nothing is saved until the second button. The post carries what the screen
 * expected for each item; if stock moved in the meantime the server refuses and asks for a fresh count.
 */
export async function OfficeStockStocktakeView(view: AdminViewServerProps) {
  const denied = await requireStaff(view, '/office/stock/stocktake')
  if (denied !== null) return denied
  const { req } = view.initPageResult
  const admin = req.payload.config.routes.admin
  const api = `${req.payload.config.routes.api}/admin/office/stock`
  const sp = view.searchParams ?? {}
  const typed = new Map<number, number>()
  for (const [key, value] of Object.entries(sp)) {
    const m = /^count_(\d{1,10})$/.exec(key)
    const n = m ? parseWholeQty(first(value), { min: 0 }) : null
    if (m && n !== null) typed.set(Number(m[1]), n)
  }
  const page = await getStocktakePage(req.user, typed)
  if (!page) return null
  const base = `${admin}/office/stock`
  const changed = page.rows.filter((r) => r.delta !== null && r.delta !== 0)

  return (
    <AdminPage view={view}>
      <SetStepNav nav={[{ label: 'Club office', url: `${admin}/office` }, { label: 'Stock', url: base }, { label: 'Stocktake' }]} />
      <h1 className="club-page__title">Stocktake</h1>
      <p className="club-page__lead">Count what is on the shelf and type it in. Leave an item blank if you did not count it. You will see the differences before anything is saved.</p>
      <StockFlash notice={first(sp.notice)} error={first(sp.error)} n={first(sp.n)} />

      <form method="get" action={`${base}/stocktake`} className="office-form">
        {page.rows.length === 0 ? <p className="club-attention__none">No items yet.</p> : null}
        <table className="club-table office-table" role="table">
          <caption className="club-muted">Items in use</caption>
          <thead role="rowgroup">
            <tr role="row">
              <th scope="col" role="columnheader">Item</th>
              <th scope="col" role="columnheader">Type</th>
              <th scope="col" role="columnheader" className="office-num">Should be</th>
              <th scope="col" role="columnheader">Counted</th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {page.rows.map((r) => (
              <tr key={r.id} role="row">
                <th scope="row" role="rowheader" data-label="Item">{r.label}</th>
                <td role="cell" data-label="Type">{r.categoryLabel}</td>
                <td role="cell" className="office-num" data-label="Should be">{r.expected}</td>
                <td role="cell" data-label="Counted">
                  <input name={`count_${r.id}`} defaultValue={r.counted ?? ''} inputMode="numeric" pattern="[0-9]*" maxLength={6} aria-label={`Counted: ${r.label}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="submit" className="btn btn--style-primary btn--size-medium">Show the differences</button>
      </form>

      {page.review ? (
        <section aria-labelledby="diff">
          <h2 id="diff" className="club-page__subtitle">Differences</h2>
          {changed.length === 0 ? (
            <p className="club-attention__none">Every count matches, so there is nothing to change.</p>
          ) : (
            <form method="post" action={`${api}/stocktake`} className="office-form">
              <Nonce />
              <ul className="office-list">
                {changed.map((r) => (
                  <li key={r.id}>
                    <strong>{r.label}</strong>: should be {r.expected}, counted {r.counted}: <strong>{(r.delta as number) > 0 ? `+${r.delta}` : r.delta}</strong>
                    <input type="hidden" name={`count_${r.id}`} value={r.counted as number} />
                    <input type="hidden" name={`expected_${r.id}`} value={r.expected} />
                  </li>
                ))}
              </ul>
              {page.rows.filter((r) => r.delta === 0).map((r) => (
                <span key={r.id}>
                  <input type="hidden" name={`count_${r.id}`} value={r.counted as number} />
                  <input type="hidden" name={`expected_${r.id}`} value={r.expected} />
                </span>
              ))}
              <button type="submit" className="btn btn--style-primary btn--size-medium">Save these {changed.length} {changed.length === 1 ? 'change' : 'changes'}</button>
            </form>
          )}
        </section>
      ) : null}
    </AdminPage>
  )
}
