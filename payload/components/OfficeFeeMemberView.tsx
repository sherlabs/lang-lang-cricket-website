import { SetStepNav } from '@payloadcms/ui'
import type { AdminViewServerProps } from 'payload'
import { getMemberLedger } from '@/lib/fees-office-queries'
import { FEE_ERROR_TEXT, FEE_NOTICE_TEXT, isFeeError, isFeeNotice, METHOD_LABELS, PAYMENT_METHODS, parseTarget } from '@/lib/office/fee-input'
import { STATUS_LABEL, STATUS_MARK, type PaymentTarget } from '@/lib/office/fees'
import { formatMoney, parseMoney } from '@/lib/office/money'
import { currentClubDate } from '@/lib/selection/club-date'
import { isAdminUser } from '../access'
import { AdminPage, requireUser } from './AdminPage'

const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''))
const targetText = (t: PaymentTarget | null | undefined): string => (!t ? 'General (oldest debt first)' : t.kind === 'season' ? `Season ${t.season}` : 'One game or charge')

/**
 * `/admin/office/fees/member/:id` (custom view, admin only): one member's ledger. Every charge with its status in words and a mark,
 * the payments and waivers (voided with a reason, never deleted), and the forms to record a payment, split one across children,
 * or waive a fee. "Show what this will settle" re-draws the page with the same arithmetic the report uses before anything is saved.
 */
export async function OfficeFeeMemberView(view: AdminViewServerProps) {
  requireUser(view, '/office/fees')
  const { req } = view.initPageResult
  const admin = req.payload.config.routes.admin
  const api = `${req.payload.config.routes.api}/admin/office`
  if (!isAdminUser(req.user)) {
    return (
      <AdminPage view={view}>
        <h1 className="club-page__title">Member fees</h1>
        <p className="club-page__lead">Only admins can see fees.</p>
      </AdminPage>
    )
  }
  const segments = (view.params?.segments as string[] | undefined) ?? []
  const memberId = Number(segments[segments.length - 1])
  const sp = view.searchParams ?? {}
  const pAmount = parseMoney(first(sp.pamount))
  const pTargetRaw = parseTarget(first(sp.ptarget))
  const pTarget = pTargetRaw === 'bad' ? null : pTargetRaw
  const ledger = await getMemberLedger(req.user, memberId, pAmount ? { amountCents: pAmount, target: pTarget } : undefined)
  const backTo = `${admin}/office/fees`
  if (!ledger) {
    return (
      <AdminPage view={view}>
        <SetStepNav nav={[{ label: 'Club office', url: `${admin}/office` }, { label: 'Fees', url: backTo }, { label: 'Not found' }]} />
        <h1 className="club-page__title">Member fees</h1>
        <p className="club-page__lead">That member could not be found. <a href={backTo}>Back to Fees</a></p>
      </AdminPage>
    )
  }
  const { member, allocation, settings } = ledger
  const money = (c: number) => formatMoney(c, settings)
  const notice = first(sp.notice)
  const error = first(sp.error)
  const returnTo = `/office/fees/member/${member.id}`
  const hidden = <input type="hidden" name="return" value={returnTo} />
  const today = currentClubDate()
  const bySeason = new Map<string, typeof allocation.lines>()
  for (const l of allocation.lines) bySeason.set(l.season, [...(bySeason.get(l.season) ?? []), l])
  const owedTotal = allocation.lines.reduce((s, l) => s + l.owedCents, 0)
  const targetOptions: { value: string; label: string }[] = [
    { value: '', label: 'General (oldest debt first)' },
    ...[...bySeason.keys()].map((s) => ({ value: `season:${s}`, label: `Season ${s}` })),
    ...allocation.lines.filter((l) => l.kind === 'game' && l.matchId && l.owedCents > 0).map((l) => ({ value: `match:${l.matchId}`, label: `${l.date}: ${l.description}` })),
  ]
  const otherHousehold = ledger.household.filter((h) => h.id !== member.id)
  const closed = ledger.closedSeasons

  return (
    <AdminPage view={view}>
      <SetStepNav nav={[{ label: 'Club office', url: `${admin}/office` }, { label: 'Fees', url: backTo }, { label: member.name }]} />
      <h1 className="club-page__title">{member.name}</h1>
      <p className="club-page__lead">
        {owedTotal > 0 ? `! Owes ${money(owedTotal)}` : '✓ Nothing owing'}. {allocation.creditCents > 0 ? `Credit held: ${money(allocation.creditCents)}. ` : ''}
        <a href={backTo}>Back to Fees</a> &middot; <a href={`${admin}/collections/members/${member.id}`}>Open member</a>
      </p>

      <div role="status" aria-live="polite">
        {isFeeNotice(notice) ? <p className="office-flash office-flash--ok">{FEE_NOTICE_TEXT[notice]}</p> : null}
        {isFeeError(error) ? <p className="office-flash office-flash--error">{FEE_ERROR_TEXT[error]}</p> : null}
      </div>

      {ledger.household.length > 1 ? (
        <p className="club-muted">
          Household: {ledger.household.map((h, i) => (
            <span key={h.id}>{i > 0 ? ', ' : ''}{h.id === member.id ? h.name : <a href={`${admin}/office/fees/member/${h.id}`}>{h.name}</a>}</span>
          ))}
        </p>
      ) : null}

      <h2>Charges</h2>
      {allocation.lines.length === 0 ? <p className="club-attention__none">No charges yet. Add this member to a season from the Fees page.</p> : [...bySeason.entries()].map(([season, lines]) => (
        <section key={season} aria-label={`Charges for ${season}`}>
          <h3>{season} {closed.includes(season) ? '(closed)' : '(open)'}</h3>
          <table className="club-table office-table" role="table">
            <thead role="rowgroup">
              <tr role="row">
                <th scope="col" role="columnheader">Charge</th>
                <th scope="col" role="columnheader">Status</th>
                <th scope="col" role="columnheader" className="office-num">Charged</th>
                <th scope="col" role="columnheader" className="office-num">Waived</th>
                <th scope="col" role="columnheader" className="office-num">Paid</th>
                <th scope="col" role="columnheader" className="office-num">Owing</th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              {lines.map((l) => (
                <tr key={l.id} role="row">
                  <th scope="row" role="rowheader" data-label="Charge">{l.date}: {l.description}{l.kind === 'adjustment' ? ' (adjustment)' : ''}</th>
                  <td role="cell" data-label="Status"><span className="office-status">{STATUS_MARK[l.status]} {STATUS_LABEL[l.status]}</span></td>
                  <td role="cell" className="office-num" data-label="Charged">{money(l.amountCents)}</td>
                  <td role="cell" className="office-num" data-label="Waived">{money(l.waivedCents)}</td>
                  <td role="cell" className="office-num" data-label="Paid">{money(l.paidCents)}</td>
                  <td role="cell" className="office-num" data-label="Owing">{money(l.owedCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      <h2>Record a payment</h2>
      <p className="club-muted">Payments are recorded by hand. Never type card numbers. Money with no target pays the oldest debt first. Money aimed at a season stays with that season; anything beyond what it owes is held as credit.</p>
      <form method="get" action={`${admin}/office/fees/member/${member.id}`} className="office-box office-form">
        <h3>Check what a payment will do</h3>
        <label>Amount<input name="pamount" inputMode="decimal" defaultValue={first(sp.pamount)} autoComplete="off" /></label>
        <label>Aimed at
          <select name="ptarget" defaultValue={first(sp.ptarget)}>{targetOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        </label>
        <button type="submit" className="btn btn--style-secondary btn--size-medium">Show what this will settle</button>
        {ledger.preview ? (
          <div role="status" aria-live="polite">
            <p><strong>{pAmount ? `${money(pAmount)}, ${targetText(pTarget).toLowerCase()}:` : ''}</strong></p>
            {ledger.preview.settles.length === 0 ? <p>This would not settle any charge.</p> : (
              <ul>{ledger.preview.settles.map((s) => <li key={s.description}>{s.description}: {money(s.addedCents)} ({STATUS_LABEL[s.becomes as keyof typeof STATUS_LABEL] ?? s.becomes})</li>)}</ul>
            )}
            <p>Credit left after this: {money(ledger.preview.creditAfter)} (now {money(ledger.preview.creditBefore)}).</p>
          </div>
        ) : null}
      </form>
      <form method="post" action={`${api}/fees/payment`} className="office-box office-form">
        {hidden}
        <input type="hidden" name="memberId" value={member.id} />
        <label>Amount<input name="amount" required inputMode="decimal" defaultValue={first(sp.pamount)} autoComplete="off" /></label>
        <label>Date received<input name="receivedOn" type="date" defaultValue={today} max={today} required /></label>
        <label>How it was paid
          <select name="method" defaultValue="cash">{PAYMENT_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}</select>
        </label>
        <label>Paid by
          <select name="payerId" defaultValue={member.id}>{ledger.household.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select>
        </label>
        <label>Aimed at
          <select name="target" defaultValue={first(sp.ptarget)}>{targetOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        </label>
        <label>Reference (optional)<input name="reference" maxLength={120} autoComplete="off" /></label>
        <label>Note (optional)<input name="note" maxLength={500} autoComplete="off" /></label>
        {otherHousehold.length > 0 ? (
          <fieldset>
            <legend>Split across children (optional; season or general only)</legend>
            <p className="club-muted">Tick the members this money is for. Leave the shares blank for an even split, or type each share so they add up to the amount.</p>
            <div className="office-split">
              {ledger.household.map((h) => (
                <div key={h.id} className="office-split__row">
                  <label className="office-check"><input type="checkbox" name="splitIds" value={h.id} /> {h.name}</label>
                  <input name="splitShares" inputMode="decimal" aria-label={`Share for ${h.name}`} autoComplete="off" />
                </div>
              ))}
            </div>
          </fieldset>
        ) : null}
        <button type="submit" className="btn btn--style-primary btn--size-large">Record payment</button>
      </form>

      <h2>Payments</h2>
      {ledger.payments.length === 0 ? <p className="club-attention__none">No payments yet.</p> : (
        <ul className="office-list">
          {ledger.payments.map((p) => (
            <li key={p.id}>
              <span className={p.voided ? 'office-list--voided' : ''}>{p.receivedOn}: {money(p.amountCents)} ({METHOD_LABELS[p.method as keyof typeof METHOD_LABELS] ?? p.method}). {targetText(p.appliesTo)}.{p.payerId && p.payerId !== member.id ? ` Paid by ${p.payerName}.` : ''}{p.reference ? ` Ref: ${p.reference}.` : ''}{p.note ? ` ${p.note}` : ''}</span>
              {p.voided ? <strong> Voided.</strong> : (
                <details className="office-void">
                  <summary>Void this payment</summary>
                  <form method="post" action={`${api}/fees/payment-void`} className="office-form">
                    {hidden}
                    <input type="hidden" name="id" value={p.id} />
                    <label>Why is it being voided?<input name="reason" required maxLength={300} autoComplete="off" /></label>
                    {p.splitGroup ? <label className="office-check"><input type="checkbox" name="wholeGroup" value="yes" /> Void every part of this split payment</label> : null}
                    <button type="submit" className="btn btn--style-secondary btn--size-medium">Void payment</button>
                  </form>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}

      <h2>Waivers</h2>
      {ledger.waivers.length === 0 ? <p className="club-attention__none">No waivers.</p> : (
        <ul className="office-list">
          {ledger.waivers.map((w) => (
            <li key={w.id}>
              <span className={w.voided ? 'office-list--voided' : ''}>{w.scope === 'game' ? 'One game' : w.scope === 'season' ? `Whole season ${w.season ?? ''}` : `${money(w.amountCents ?? 0)}${w.season ? ` in ${w.season}` : ''}`}. {w.note}</span>
              {w.voided ? <strong> Voided.</strong> : (
                <details className="office-void">
                  <summary>Void this waiver</summary>
                  <form method="post" action={`${api}/fees/waiver-void`} className="office-form">
                    {hidden}
                    <input type="hidden" name="id" value={Number(w.id)} />
                    <label>Why is it being voided?<input name="reason" required maxLength={300} autoComplete="off" /></label>
                    <button type="submit" className="btn btn--style-secondary btn--size-medium">Void waiver</button>
                  </form>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}

      <details className="office-box">
        <summary>Waive a fee</summary>
        <form method="post" action={`${api}/fees/waiver`} className="office-form">
          {hidden}
          <input type="hidden" name="memberId" value={member.id} />
          <label>What to waive
            <select name="scope" defaultValue="amount">
              <option value="game">One game</option>
              <option value="season">The whole season</option>
              <option value="amount">An amount</option>
            </select>
          </label>
          <label>Which game (for one game)
            <select name="matchId" defaultValue="">
              <option value="">Not for a game</option>
              {allocation.lines.filter((l) => l.kind === 'game' && l.matchId).map((l) => <option key={l.id} value={l.matchId}>{l.date}: {l.description}</option>)}
            </select>
          </label>
          <label>Season (for a whole season, or to limit an amount)
            <select name="waiverSeason" defaultValue="">
              <option value="">Any season</option>
              {ledger.seasons.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label>Amount (for an amount)<input name="amount" inputMode="decimal" autoComplete="off" /></label>
          <label>Reason (required)<input name="note" required maxLength={500} autoComplete="off" /></label>
          <button type="submit" className="btn btn--style-primary btn--size-medium">Add waiver</button>
        </form>
      </details>

      {closed.length > 0 ? (
        <details className="office-box">
          <summary>Correct a closed season</summary>
          <p>A closed season is frozen. To correct it, void the charge and add an adjustment. The reason is kept.</p>
          {ledger.storedCharges.length > 0 ? (
            <ul className="office-list">
              {ledger.storedCharges.map((c) => (
                <li key={c.id}>
                  <span className={c.voided ? 'office-list--voided' : ''}>{c.season}, {c.date}: {c.description} ({money(c.amountCents)})</span>
                  {c.voided ? <strong> Voided.</strong> : (
                    <details className="office-void">
                      <summary>Void this charge</summary>
                      <form method="post" action={`${api}/fees/charge-void`} className="office-form">
                        {hidden}
                        <input type="hidden" name="id" value={Number(c.id)} />
                        <label>Why is it being voided?<input name="reason" required maxLength={300} autoComplete="off" /></label>
                        <button type="submit" className="btn btn--style-secondary btn--size-medium">Void charge</button>
                      </form>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
          <form method="post" action={`${api}/fees/adjustment`} className="office-form">
            {hidden}
            <input type="hidden" name="memberId" value={member.id} />
            <label>Season<select name="adjustSeason">{closed.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
            <label>Amount charged<input name="amount" required inputMode="decimal" autoComplete="off" /></label>
            <label>Date<input name="date" type="date" defaultValue={today} /></label>
            <label>What it is for (required)<input name="note" required maxLength={300} autoComplete="off" /></label>
            <button type="submit" className="btn btn--style-primary btn--size-medium">Add adjustment</button>
          </form>
        </details>
      ) : null}

      {ledger.memberships.length > 0 ? (
        <>
          <h2>Memberships</h2>
          <ul className="office-list">
            {ledger.memberships.map((m) => <li key={m.season}>{m.season}: {m.tierName || 'Membership'} (season fee {money(m.upfrontCents)}, per game {money(m.perMatchCents)})</li>)}
          </ul>
        </>
      ) : null}
    </AdminPage>
  )
}
