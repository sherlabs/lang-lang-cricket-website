// @committee-facing
import { SetStepNav } from '@payloadcms/ui'
import type { AdminViewServerProps } from 'payload'
import { STOCK_CATEGORIES, CATEGORY_LABEL } from '@/lib/office/stock'
import { getStockPage } from '@/lib/stock-office-queries'
import { officeCopy } from '../admin/copy'
import { AdminPage, requireStaff } from './AdminPage'
import { LowBadge, Nonce, StatusBadge, StockFlash, first } from './OfficeStockBits'
import { EmptyState, PageHeader } from './ui'

/**
 * `/admin/office/stock` (committee): the items with how many are on hand, and a tab for what people still owe back. Low stock and
 * overdue kit are written in words, never by colour alone. Every change is a plain form posted to the stock route, so it works
 * without scripts. The owed list has names, so its download is for admins only.
 */
export async function OfficeStockView(view: AdminViewServerProps) {
  const denied = await requireStaff(view, '/office/stock')
  if (denied !== null) return denied
  const { req } = view.initPageResult
  const admin = req.payload.config.routes.admin
  const apiRoot = `${req.payload.config.routes.api}/admin/office`
  const sp = view.searchParams ?? {}
  const page = await getStockPage(req.user, { tab: first(sp.tab), q: first(sp.q), show: first(sp.show) })
  if (!page) return null
  const base = `${admin}/office/stock`
  const chip = (show: 'all' | 'low' | 'switched-off'): string => `${base}?${new URLSearchParams({ ...(page.q ? { q: page.q } : {}), ...(show === 'all' ? {} : { show }) })}`

  return (
    <AdminPage view={view}>
      <SetStepNav nav={[{ label: 'Club office', url: `${admin}/office` }, { label: 'Stock' }]} />
      <PageHeader title="Stock" lead={<>What the club holds, who has borrowed what, and what is still owed back. {officeCopy.stock.excludes}</>} />
      <StockFlash notice={first(sp.notice)} error={first(sp.error)} n={first(sp.n)} />

      <nav aria-label="Stock sections" className="office-chips">
        <a href={base} className={`office-chip${page.tab === 'items' ? ' office-chip--on' : ''}`} aria-current={page.tab === 'items' ? 'page' : undefined}>Items ({page.counts.inUse})</a>
        <a href={`${base}?tab=owed`} className={`office-chip${page.tab === 'owed' ? ' office-chip--on' : ''}`} aria-current={page.tab === 'owed' ? 'page' : undefined}>
          Owed back ({page.counts.owedUnits}{page.counts.overdue ? `, ${page.counts.overdue} overdue` : ''})
        </a>
        <a href={`${base}/stocktake`} className="office-chip">Stocktake</a>
      </nav>

      {page.tab === 'items' ? (
        <>
          <form method="get" action={base} className="office-filters" role="search">
            <label>
              Find an item
              <input name="q" defaultValue={page.q} maxLength={80} placeholder="for example helmet or large" />
            </label>
            {page.show !== 'all' ? <input type="hidden" name="show" value={page.show} /> : null}
            <button type="submit" className="ui-btn ui-btn--primary">Search</button>
          </form>
          <nav aria-label="Filter the items" className="office-chips">
            <a href={chip('all')} className={`office-chip${page.show === 'all' ? ' office-chip--on' : ''}`} aria-current={page.show === 'all' ? 'true' : undefined}>Everything</a>
            <a href={chip('low')} className={`office-chip${page.show === 'low' ? ' office-chip--on' : ''}`} aria-current={page.show === 'low' ? 'true' : undefined}>Low ({page.counts.low})</a>
            <a href={chip('switched-off')} className={`office-chip${page.show === 'switched-off' ? ' office-chip--on' : ''}`} aria-current={page.show === 'switched-off' ? 'true' : undefined}>Switched off</a>
          </nav>

          <details className="office-quickadd">
            <summary>Add stock received</summary>
            <form method="post" action={`${apiRoot}/stock/receive`} className="office-form">
              <input type="hidden" name="return" value="/office/stock" />
              <Nonce />
              <label>
                Item
                <select name="item" required defaultValue="">
                  <option value="" disabled>Pick an item</option>
                  {page.pickList.map((i) => (
                    <option key={i.id} value={i.id}>{i.label}</option>
                  ))}
                </select>
              </label>
              <label>
                How many arrived
                <input name="qty" required inputMode="numeric" pattern="[0-9]*" maxLength={6} />
              </label>
              <label>
                Note (optional)
                <input name="note" maxLength={300} />
              </label>
              <button type="submit" className="ui-btn ui-btn--primary">Add to stock</button>
            </form>
          </details>

          <details className="office-quickadd">
            <summary>Add an item</summary>
            <form method="post" action={`${apiRoot}/stock/item-add`} className="office-form">
              <input type="hidden" name="return" value="/office/stock" />
              <label>
                Item
                <input name="name" required maxLength={120} placeholder="for example Playing shirt" />
              </label>
              <label>
                Group (keeps sizes together)
                <input name="groupName" maxLength={80} />
              </label>
              <label>
                Size (optional)
                <input name="size" maxLength={40} />
              </label>
              <label>
                Type
                <select name="category" defaultValue="kit">
                  {STOCK_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
                  ))}
                </select>
              </label>
              <label>
                Low when this many or fewer (optional)
                <input name="reorderLevel" inputMode="numeric" pattern="[0-9]*" maxLength={6} />
              </label>
              <label>
                Where it is kept (optional)
                <input name="location" maxLength={120} />
              </label>
              <label>
                Expected back
                <select name="returnable" defaultValue="">
                  <option value="">Yes for kit and equipment, no for the rest</option>
                  <option value="yes">Yes, people give it back</option>
                  <option value="no">No, it is given away</option>
                </select>
              </label>
              <button type="submit" className="ui-btn ui-btn--primary">Add item</button>
            </form>
          </details>

          {page.groups.length === 0 ? (
            <EmptyState>{page.show === 'low' ? 'Nothing is low. Good news.' : page.show === 'switched-off' ? 'No items are switched off.' : page.q ? 'Nothing matches that search.' : 'No items yet. Use "Add an item" to start.'}</EmptyState>
          ) : (
            page.groups.map((g) => (
              <section key={g.category} aria-labelledby={`c-${g.category}`}>
                <h2 id={`c-${g.category}`} className="ui-section__title office-subtitle">{g.label}</h2>
                <ul className="office-list">
                  {g.items.map((i, idx) => (
                    <li key={i.id}>
                      {i.groupName && (idx === 0 || g.items[idx - 1].groupName !== i.groupName) ? <p className="club-muted">{i.groupName}</p> : null}
                      <p>
                        <a href={`${base}/item/${i.id}`}><strong>{i.name}{i.size ? `, ${i.size}` : ''}</strong></a>
                        {i.low ? <> <LowBadge onHand={i.onHand} /></> : null}
                      </p>
                      <p>
                        <strong>{i.onHand}</strong> on hand{i.unit && i.unit !== 'each' ? ` (${i.unit})` : ''}
                        {i.reorderLevel !== null ? `. Low at ${i.reorderLevel} or fewer` : ''}
                        {i.location ? `. Kept: ${i.location}` : ''}
                        {!i.active ? '. Switched off' : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </>
      ) : (
        <>
          <p className="club-muted">Kit that people have borrowed and not yet brought back, oldest first. Things given away are not listed.</p>
          {page.isAdmin && page.owed.length > 0 ? (
            <form method="post" action={`${apiRoot}/export/stock-owed`} className="office-actions">
              <button type="submit" className="ui-btn ui-btn--secondary">Download who owes kit (names, admins only)</button>
            </form>
          ) : null}
          {page.owed.length === 0 ? (
            <EmptyState>Nobody owes the club anything. Good news.</EmptyState>
          ) : (
            <>
              <h2 className="ui-section__title office-subtitle">By person</h2>
              <ul className="office-list">
                {page.byPerson.map((p) => (
                  <li key={p.memberId ?? 'none'}>
                    {p.memberId ? <a href={`${base}/people/${p.memberId}`}><strong>{p.person}</strong></a> : <strong>{p.person}</strong>}
                    {`: ${p.units} ${p.units === 1 ? 'item' : 'items'} out`}
                    {p.overdueLines ? ` (${'⚠'} ${p.overdueLines} overdue)` : ''}
                  </li>
                ))}
              </ul>
              <h2 className="ui-section__title office-subtitle">Everything out</h2>
              <table className="club-table office-table" role="table">
                <caption className="club-muted">Open loans, oldest first</caption>
                <thead role="rowgroup">
                  <tr role="row">
                    <th scope="col" role="columnheader">Person</th>
                    <th scope="col" role="columnheader">Item</th>
                    <th scope="col" role="columnheader" className="office-num">Out</th>
                    <th scope="col" role="columnheader">Issued</th>
                    <th scope="col" role="columnheader">Due back</th>
                    <th scope="col" role="columnheader">Status</th>
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {page.owed.map((o) => (
                    <tr key={o.issueId} role="row">
                      <th scope="row" role="rowheader" data-label="Person">{o.memberId ? <a href={`${base}/people/${o.memberId}`}>{o.person}</a> : o.person}</th>
                      <td role="cell" data-label="Item"><a href={`${base}/item/${o.itemId}`}>{o.item}</a></td>
                      <td role="cell" className="office-num" data-label="Out">{o.owed}</td>
                      <td role="cell" data-label="Issued">{o.issuedOn}</td>
                      <td role="cell" data-label="Due back">{o.dueBackOn ?? 'No date'}</td>
                      <td role="cell" data-label="Status"><StatusBadge status={o.status} overdue={o.overdue} days={o.daysOverdue} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}
      <p className="club-muted"><a href={`${admin}/collections/stock-items`}>Edit items in full (rename, switch off, change the low level)</a></p>
    </AdminPage>
  )
}
