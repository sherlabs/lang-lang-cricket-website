import { randomUUID } from 'node:crypto'
import { SetStepNav } from '@payloadcms/ui'
import type { AdminViewServerProps } from 'payload'
import { getFeesPage } from '@/lib/fees-office-queries'
import { FEE_ERROR_TEXT, FEE_NOTICE_TEXT, isFeeError, isFeeNotice } from '@/lib/office/fee-input'
import { formatMoney } from '@/lib/office/money'
import { isAdminUser } from '../access'
import { officeCopy } from '../admin/copy'
import { AdminPage, requireUser } from './AdminPage'

const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''))
const KINDS = { upfront: 'Fixed fee for the season', 'per-match': 'Per game played', free: 'Free' } as const

/**
 * `/admin/office/fees` (custom view, admin only): the treasurer's page. The season's totals with what each one leaves out, a table by
 * member or by household, the membership types, adding members to the season, closing the season, and the spreadsheet download.
 * Every change is a plain form posted to the Fees route, so it works without scripts. Editors see a short refusal and no data.
 */
export async function OfficeFeesView(view: AdminViewServerProps) {
  requireUser(view, '/office/fees')
  const { req } = view.initPageResult
  const admin = req.payload.config.routes.admin
  const api = `${req.payload.config.routes.api}/admin/office`
  if (!isAdminUser(req.user)) {
    return (
      <AdminPage view={view}>
        <h1 className="club-page__title">Fees</h1>
        <p className="club-page__lead">Only admins can see the fees.</p>
      </AdminPage>
    )
  }
  const sp = view.searchParams ?? {}
  const page = await getFeesPage(req.user, first(sp.season) || null)
  if (!page) return null
  const { report, settings, season } = page
  const money = (c: number) => formatMoney(c, settings)
  const base = `${admin}/office/fees`
  const households = first(sp.view) === 'households'
  const owingOnly = first(sp.owing) === '1'
  const notice = first(sp.notice)
  const error = first(sp.error)
  const rows = (owingOnly ? report.rows.filter((r) => r.owedCents > 0) : report.rows).slice().sort((a, b) => (owingOnly ? b.owedCents - a.owedCents : 0))
  const hhRows = (owingOnly ? report.households.filter((h) => h.owedCents > 0) : report.households).slice().sort((a, b) => b.owedCents - a.owedCents)
  const link = (patch: Record<string, string>) => {
    const q = new URLSearchParams({ season, ...(households ? { view: 'households' } : {}), ...(owingOnly ? { owing: '1' } : {}), ...patch })
    for (const [k, v] of [...q]) if (!v) q.delete(k)
    return `${base}?${q}`
  }
  const quality = report.unmatchedAppearances > 0 || report.missingFromStore > 0
  const activeTiers = page.tiers.filter((t) => t.active)
  const hidden = <input type="hidden" name="return" value="/office/fees" />
  const seasonField = <input type="hidden" name="season" value={season} />

  return (
    <AdminPage view={view}>
      <SetStepNav nav={[{ label: 'Club office', url: `${admin}/office` }, { label: 'Fees' }]} />
      <h1 className="club-page__title">Fees</h1>
      <p className="club-page__lead">
        Membership and match fees for {season}. <span className="office-badge">{report.closed ? 'Closed' : 'Open'}</span> Only admins can see this page. Payments are recorded by hand; no card details are ever stored.
      </p>

      <div role="status" aria-live="polite">
        {isFeeNotice(notice) ? <p className="office-flash office-flash--ok">{FEE_NOTICE_TEXT[notice]}{first(sp.n) ? ` (${first(sp.n)})` : ''}</p> : null}
        {isFeeError(error) ? <p className="office-flash office-flash--error">{FEE_ERROR_TEXT[error]}</p> : null}
      </div>

      <form method="get" action={base} className="office-filters" role="search">
        <label>
          Season
          <select name="season" defaultValue={season}>
            {page.seasons.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn--style-primary btn--size-medium">Show season</button>
      </form>

      {!report.closed ? <p className="office-flash">{officeCopy.fees.openNote}</p> : null}
      {report.closed && report.drift ? <p className="office-flash office-flash--error">{officeCopy.fees.drift(money(report.drift.derivedCents), money(report.drift.storedCents))}</p> : null}
      {quality && !report.closed ? <p className="office-flash office-flash--error">{officeCopy.fees.quality(report.unmatchedAppearances, report.missingFromStore)}</p> : null}

      <ul className="office-cards" aria-label="Season totals">
        <li className="office-card"><span className="office-card__label">Payable</span><span className="office-card__value">{money(report.totals.payableCents)}</span><span className="office-card__hint">After waivers.</span></li>
        <li className="office-card"><span className="office-card__label">Paid</span><span className="office-card__value">{money(report.totals.paidCents)}</span><span className="office-card__hint">All payments to date, aimed ones first.</span></li>
        <li className="office-card"><span className="office-card__label">Waived</span><span className="office-card__value">{money(report.totals.waivedCents)}</span><span className="office-card__hint">Fees the committee waived.</span></li>
        <li className="office-card"><span className="office-card__label">Outstanding</span><span className="office-card__value">{money(report.totals.owedCents)}{report.incomplete ? ' (incomplete)' : ''}</span><span className="office-card__hint">{officeCopy.fees.excludes}</span></li>
        <li className="office-card"><span className="office-card__label">Credit held</span><span className="office-card__value">{money(report.totals.creditCents)}</span><span className="office-card__hint">Money received beyond what is owed. It rolls forward.</span></li>
      </ul>

      <p className="office-chips" aria-label="Table options">
        <a className={`office-chip${!households ? ' office-chip--on' : ''}`} href={link({ view: '' })} aria-current={!households ? 'true' : undefined}>By member{!households ? ' (on)' : ''}</a>
        <a className={`office-chip${households ? ' office-chip--on' : ''}`} href={link({ view: 'households' })} aria-current={households ? 'true' : undefined}>By household{households ? ' (on)' : ''}</a>
        <a className={`office-chip${owingOnly ? ' office-chip--on' : ''}`} href={link({ owing: owingOnly ? '' : '1' })} aria-current={owingOnly ? 'true' : undefined}>Owing only{owingOnly ? ' (on)' : ''}</a>
      </p>

      {report.rows.length === 0 ? (
        <p className="club-attention__none">No one is in {season} yet. Set up a membership type and add members below.</p>
      ) : (
        <table className="club-table office-table" role="table">
          <caption className="club-muted">{officeCopy.fees.paidLabel}. {officeCopy.fees.paidSpecificLabel} counts only payments aimed at this season.</caption>
          <thead role="rowgroup">
            <tr role="row">
              <th scope="col" role="columnheader">{households ? 'Household' : 'Member'}</th>
              {households ? null : <th scope="col" role="columnheader">Type</th>}
              <th scope="col" role="columnheader" className="office-num">Payable</th>
              <th scope="col" role="columnheader" className="office-num">Paid (all payments to date)</th>
              <th scope="col" role="columnheader" className="office-num">Paid for this season</th>
              <th scope="col" role="columnheader" className="office-num">Waived</th>
              <th scope="col" role="columnheader" className="office-num">Owing</th>
              <th scope="col" role="columnheader" className="office-num">Credit</th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {households
              ? hhRows.map((h) => (
                  <tr key={h.key} role="row">
                    <th scope="row" role="rowheader" data-label="Household">
                      {h.memberIds.map((id, i) => (
                        <span key={id}>{i > 0 ? ', ' : ''}<a href={`${admin}/office/fees/member/${id}`}>{h.names[i]}</a></span>
                      ))}
                    </th>
                    <td role="cell" className="office-num" data-label="Payable">{money(h.payableCents)}</td>
                    <td role="cell" className="office-num" data-label="Paid (all payments to date)">{money(h.paidCents)}</td>
                    <td role="cell" className="office-num" data-label="Paid for this season">{money(h.paidSpecificCents)}</td>
                    <td role="cell" className="office-num" data-label="Waived">{money(h.waivedCents)}</td>
                    <td role="cell" className="office-num" data-label="Owing"><span className="office-status">{h.owedCents > 0 ? `! Owing ${money(h.owedCents)}` : '✓ Settled'}</span></td>
                    <td role="cell" className="office-num" data-label="Credit">{money(h.creditCents)}</td>
                  </tr>
                ))
              : rows.map((r) => (
                  <tr key={r.memberId} role="row">
                    <th scope="row" role="rowheader" data-label="Member"><a href={`${admin}/office/fees/member/${r.memberId}`}>{r.name}</a></th>
                    <td role="cell" data-label="Type">{r.tier || 'None'}</td>
                    <td role="cell" className="office-num" data-label="Payable">{money(r.payableCents)}</td>
                    <td role="cell" className="office-num" data-label="Paid (all payments to date)">{money(r.paidCents)}</td>
                    <td role="cell" className="office-num" data-label="Paid for this season">{money(r.paidSpecificCents)}</td>
                    <td role="cell" className="office-num" data-label="Waived">{money(r.waivedCents)}</td>
                    <td role="cell" className="office-num" data-label="Owing"><span className="office-status">{r.owedCents > 0 ? `! Owing ${money(r.owedCents)}` : '✓ Settled'}</span></td>
                    <td role="cell" className="office-num" data-label="Credit">{money(r.creditCents)}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      )}

      <details className="office-box" open={Boolean(error) && !report.closed}>
        <summary>Set up fees: membership types for {season}</summary>
        {page.tiers.length === 0 ? <p>No membership types for {season} yet.</p> : (
          <ul className="office-list">
            {page.tiers.map((t) => (
              <li key={t.id}>
                <strong>{t.name}</strong> ({KINDS[t.kind as keyof typeof KINDS] ?? t.kind}): season fee {money(t.upfrontCents)}, per game {money(t.perMatchCents)}.{' '}
                {t.inUse ? 'In use, so the amounts are fixed. ' : ''}
                {t.active ? '' : 'Not offered to new members. '}
                <a href={`${admin}/collections/membership-tiers/${t.id}`}>Advanced edit</a>
              </li>
            ))}
          </ul>
        )}
        {report.closed ? <p>This season is closed, so its types cannot change.</p> : (
          <>
            <form method="post" action={`${api}/fees/tier`} className="office-form">
              {hidden}{seasonField}
              <label>Name<input name="name" required maxLength={80} autoComplete="off" /></label>
              <label>How it is charged
                <select name="kind" defaultValue="upfront">
                  {Object.entries(KINDS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <label>Season fee (leave blank for none)<input name="upfront" inputMode="decimal" autoComplete="off" /></label>
              <label>Fee per game (leave blank for none)<input name="perMatch" inputMode="decimal" autoComplete="off" /></label>
              <button type="submit" className="btn btn--style-primary btn--size-medium">Add membership type</button>
            </form>
            <form method="post" action={`${api}/fees/tiers-copy`} className="office-actions">
              {hidden}{seasonField}
              <button type="submit" className="btn btn--style-secondary btn--size-medium">Copy last season&rsquo;s types</button>
            </form>
          </>
        )}
      </details>

      {report.closed ? null : (
        <details className="office-box">
          <summary>Add members to {season}</summary>
          {activeTiers.length === 0 ? <p>Add a membership type first.</p> : page.unjoined.length === 0 ? <p>Every active member is already in {season}.</p> : (
            <>
              <form method="post" action={`${api}/fees/membership`} className="office-form">
                {hidden}{seasonField}
                <label>Member
                  <select name="memberIds" required defaultValue="">
                    <option value="" disabled>Pick a member</option>
                    {page.unjoined.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </label>
                <label>Membership type
                  <select name="tierId" required>{activeTiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
                </label>
                <label>Joined on (optional)<input name="joinedOn" type="date" /></label>
                <button type="submit" className="btn btn--style-primary btn--size-medium">Add member</button>
              </form>
              <form method="post" action={`${api}/fees/membership`} className="office-form">
                {hidden}{seasonField}
                {page.unjoined.filter((m) => m.isPlayer).map((m) => <input key={m.id} type="hidden" name="memberIds" value={m.id} />)}
                <label>Add every player who is not in yet ({page.unjoined.filter((m) => m.isPlayer).length}) as
                  <select name="tierId" required>{activeTiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
                </label>
                <button type="submit" className="btn btn--style-secondary btn--size-medium" disabled={page.unjoined.every((m) => !m.isPlayer)}>Add all players</button>
              </form>
            </>
          )}
        </details>
      )}

      {report.closed || page.membershipCount === 0 ? null : (
        <details className="office-box office-box--danger">
          <summary>Close {season}</summary>
          <p>Closing stores every charge for {season} as it stands now and freezes the figures. Later changes to match data will not move them; a correction after that is a void plus an adjustment. It cannot be undone.</p>
          <form method="post" action={`${api}/fees/close`} className="office-form">
            {hidden}{seasonField}
            <input type="hidden" name="nonce" value={randomUUID()} />
            {report.unmatchedAppearances > 0 ? (
              <label className="office-check"><input type="checkbox" name="closeAnyway" value="yes" /> {report.unmatchedAppearances} {report.unmatchedAppearances === 1 ? 'game' : 'games'} could not be matched to a member. Close anyway</label>
            ) : null}
            <label className="office-check"><input type="checkbox" name="confirm" value="yes" required /> Yes, close {season} and freeze its figures</label>
            <button type="submit" className="btn btn--style-primary btn--size-medium">Close season</button>
          </form>
        </details>
      )}

      <form method="post" action={`${api}/export/fees`} className="office-box office-form">
        <h2>Download as a spreadsheet</h2>
        <p>One row per member for {season}. The download is logged. Date of birth, emergency contact and notes are never included.</p>
        {seasonField}
        <label className="office-check"><input type="checkbox" name="detail" value="yes" /> Also include one row per charge</label>
        <div className="office-actions"><button type="submit" className="btn btn--style-primary btn--size-medium">Download CSV</button></div>
      </form>
    </AdminPage>
  )
}
