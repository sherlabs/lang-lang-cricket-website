import { SetStepNav } from '@payloadcms/ui'
import type { AdminViewServerProps } from 'payload'
import { KIND_LABEL, parseStockId } from '@/lib/office/stock'
import { getItemPage } from '@/lib/stock-office-queries'
import { AdminPage, requireStaff } from './AdminPage'
import { LowBadge, Nonce, StockFlash, first } from './OfficeStockBits'

/**
 * `/admin/office/stock/item/:id` (committee): one item. How many are on hand, the forms to issue it, take stock in or write it off,
 * who holds it, and its whole history with a void button (a mistake is voided with a reason, never edited or deleted).
 */
export async function OfficeStockItemView(view: AdminViewServerProps) {
  const { req } = view.initPageResult
  const segments = (view.params?.segments as string[] | undefined) ?? []
  const id = parseStockId(segments[segments.length - 1])
  const denied = await requireStaff(view, `/office/stock${id ? `/item/${id}` : ''}`)
  if (denied !== null) return denied
  const admin = req.payload.config.routes.admin
  const api = `${req.payload.config.routes.api}/admin/office/stock`
  const sp = view.searchParams ?? {}
  const page = id ? await getItemPage(req.user, id) : null
  const base = `${admin}/office/stock`
  if (!page) {
    return (
      <AdminPage view={view}>
        <SetStepNav nav={[{ label: 'Club office', url: `${admin}/office` }, { label: 'Stock', url: base }, { label: 'Not found' }]} />
        <h1 className="club-page__title">Item not found</h1>
        <p><a href={base}>Back to Stock</a></p>
      </AdminPage>
    )
  }
  const { item } = page
  const ret = `/office/stock/item/${item.id}`
  const label = item.size ? `${item.name}, ${item.size}` : item.name
  const hidden = <input type="hidden" name="return" value={ret} />

  return (
    <AdminPage view={view}>
      <SetStepNav nav={[{ label: 'Club office', url: `${admin}/office` }, { label: 'Stock', url: base }, { label }]} />
      <h1 className="club-page__title">{label}</h1>
      <p className="club-page__lead">
        <strong>{item.onHand}</strong> on hand{item.unit && item.unit !== 'each' ? ` (${item.unit})` : ''}. {item.low ? <LowBadge onHand={item.onHand} /> : null}
      </p>
      <p className="club-muted">
        {item.categoryLabel}
        {item.groupName ? `. Group: ${item.groupName}` : ''}
        {item.reorderLevel !== null ? `. Low at ${item.reorderLevel} or fewer` : '. No low level set, so it is not checked'}
        {item.location ? `. Kept: ${item.location}` : ''}
        {item.returnable ? '. Expected back' : '. Given away'}
        {!item.active ? '. Switched off' : ''}
      </p>
      <StockFlash notice={first(sp.notice)} error={first(sp.error)} n={first(sp.n)} />

      {item.active ? (
        <details className="office-box" open>
          <summary>Issue to a person</summary>
          {page.people.length === 0 ? (
            <p>No one can be given kit yet. People must be active members who are players, volunteers, committee or coaches.</p>
          ) : (
            <form method="post" action={`${api}/issue`} className="office-form">
              {hidden}
              <Nonce />
              <input type="hidden" name="item" value={item.id} />
              <label>
                Person
                <select name="member" required defaultValue="">
                  <option value="" disabled>Pick a person</option>
                  {page.people.map((p) => (
                    <option key={p.id} value={p.id}>{p.displayName}</option>
                  ))}
                </select>
              </label>
              <label>
                How many
                <input name="qty" required defaultValue="1" inputMode="numeric" pattern="[0-9]*" maxLength={6} />
              </label>
              <label>
                Due back (optional)
                <input name="dueBackOn" type="date" min={page.today} />
              </label>
              <label>
                Note (optional)
                <input name="note" maxLength={300} />
              </label>
              <label className="office-check">
                <input type="checkbox" name="anyway" value="yes" />
                <span>Issue anyway, even if the count says there is not enough (fix the count with a stocktake)</span>
              </label>
              <button type="submit" className="btn btn--style-primary btn--size-medium">Issue</button>
            </form>
          )}
        </details>
      ) : null}

      <details className="office-box">
        <summary>Stock received</summary>
        <form method="post" action={`${api}/receive`} className="office-form">
          {hidden}
          <Nonce />
          <input type="hidden" name="item" value={item.id} />
          <label>
            How many arrived
            <input name="qty" required inputMode="numeric" pattern="[0-9]*" maxLength={6} />
          </label>
          <label>
            Note (optional)
            <input name="note" maxLength={300} />
          </label>
          <button type="submit" className="btn btn--style-primary btn--size-medium">Add to stock</button>
        </form>
      </details>

      <details className="office-box">
        <summary>Lost or worn out (not with a person)</summary>
        <form method="post" action={`${api}/remove`} className="office-form">
          {hidden}
          <Nonce />
          <input type="hidden" name="item" value={item.id} />
          <label>
            What happened
            <select name="kind" defaultValue="written-off">
              <option value="written-off">Worn out or thrown away</option>
              <option value="lost">Lost from the store</option>
            </select>
          </label>
          <label>
            How many
            <input name="qty" required inputMode="numeric" pattern="[0-9]*" maxLength={6} />
          </label>
          <label>
            Note (optional)
            <input name="note" maxLength={300} />
          </label>
          <button type="submit" className="btn btn--style-secondary btn--size-medium">Take away from stock</button>
        </form>
      </details>

      {page.holders.length > 0 ? (
        <section aria-labelledby="holders">
          <h2 id="holders" className="club-page__subtitle">Who has it</h2>
          <ul className="office-list">
            {page.holders.map((h) => (
              <li key={h.memberId ?? 'none'}>
                {h.memberId ? <a href={`${base}/people/${h.memberId}`}><strong>{h.person}</strong></a> : <strong>{h.person}</strong>}
                {`: ${h.units} out`}
                {h.overdueLines ? ` (${'⚠'} overdue)` : ''}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="history">
        <h2 id="history" className="club-page__subtitle">History</h2>
        {page.movements.length === 0 ? (
          <p className="club-attention__none">Nothing recorded yet.</p>
        ) : (
          <ul className="office-list">
            {page.movements.map((m) => (
              <li key={m.id} className={m.voided ? 'office-list--voided' : undefined}>
                <p>
                  <strong>{KIND_LABEL[m.kind]}</strong>: {m.kind === 'adjustment' && m.qty > 0 ? `+${m.qty}` : m.qty} on {m.date}
                  {m.person ? `, ${m.person}` : ''}
                  {m.issueStatus ? ` (${m.issueStatus === 'part-returned' ? 'part returned' : m.issueStatus})` : ''}
                  {m.note ? `. ${m.note}` : ''}
                </p>
                {m.voided ? (
                  <p className="club-muted">Voided{m.voidReason ? `: ${m.voidReason}` : ''}. Not counted.</p>
                ) : (
                  <details className="office-void">
                    <summary aria-label={`Void ${KIND_LABEL[m.kind]} of ${m.qty} on ${m.date}`}>Void this</summary>
                    <form method="post" action={`${api}/void`} className="office-inline">
                      {hidden}
                      <input type="hidden" name="id" value={m.id} />
                      <label>
                        Why (it stays in the history)
                        <input name="reason" required maxLength={300} />
                      </label>
                      <button type="submit" className="btn btn--style-secondary btn--size-medium">Void</button>
                    </form>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="club-muted"><a href={`${admin}/collections/stock-items/${item.id}`}>Edit this item in full (rename, switch off, change the low level)</a></p>
    </AdminPage>
  )
}
