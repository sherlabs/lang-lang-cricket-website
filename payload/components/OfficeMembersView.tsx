import { SetStepNav } from '@payloadcms/ui'
import type { AdminViewServerProps } from 'payload'
import { duplicateEmailCount, duplicateEmailMemberIds, getMemberRow, listMembers, memberCompleteness } from '@/lib/members-queries'
import { ERROR_TEXT, isFormError, isNotice, NOTICE_TEXT } from '@/lib/office/flash'
import { MISSING_KEYS, parseMemberQuery, queryString, type MemberQuery } from '@/lib/office/member-filters'
import { MEMBER_ROLES, ROLE_LABELS } from '@/lib/office/members'
import { isAdminUser } from '../access'
import { officeCopy } from '../admin/copy'
import { AdminPage, requireUser } from './AdminPage'

const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''))
const MISSING_LABELS: Record<(typeof MISSING_KEYS)[number], string> = { email: 'No email', phone: 'No phone', both: 'No email or phone', guardian: 'Junior with no guardian' }

/**
 * `/admin/office/members` (custom view, admin only): the member directory. Search, filters and a completeness strip on top; a list
 * of cards on a phone and a table from tablet width. Adding, exporting and removing personal details are plain forms posted to the
 * office routes, so everything works without scripts. An editor who opens this address sees a short refusal and no data.
 */
export async function OfficeMembersView(view: AdminViewServerProps) {
  requireUser(view, '/office/members')
  const { req } = view.initPageResult
  const admin = req.payload.config.routes.admin
  const api = `${req.payload.config.routes.api}/admin/office`
  if (!isAdminUser(req.user)) {
    return (
      <AdminPage view={view}>
        <h1 className="club-page__title">Members</h1>
        <p className="club-page__lead">Only admins can see the member list.</p>
      </AdminPage>
    )
  }
  const sp = view.searchParams ?? {}
  const query = parseMemberQuery(sp)
  const base = `${admin}/office/members`
  const [dir, strip, dupes, dupeIds] = await Promise.all([listMembers(req.user, query), memberCompleteness(req.user), duplicateEmailCount(req.user), duplicateEmailMemberIds(req.user)])
  const notice = first(sp.notice)
  const error = first(sp.error)
  const eraseId = Number(first(sp.erase))
  const eraseRow = Number.isInteger(eraseId) && eraseId > 0 ? (dir?.rows.find((r) => r.id === eraseId) ?? (await getMemberRow(req.user, eraseId))) : null
  const chip = (label: string, patch: Partial<MemberQuery>, active: boolean) => (
    <a key={label} className={`office-chip${active ? ' office-chip--on' : ''}`} href={`${base}${queryString({ ...query, page: 1, ...patch })}`} aria-current={active ? 'true' : undefined}>
      {label}
      {active ? ' (on)' : ''}
    </a>
  )
  const created = Number(first(sp.created))

  return (
    <AdminPage view={view}>
      <SetStepNav nav={[{ label: 'Club office', url: `${admin}/office` }, { label: 'Members' }]} />
      <h1 className="club-page__title">Members</h1>
      <p className="club-page__lead">Everyone in the club with their contact details. Only admins can see this page. Opening one member is not logged; exports and removals are.</p>

      <div role="status" aria-live="polite">
        {isNotice(notice) ? (
          <p className="office-flash office-flash--ok">
            {NOTICE_TEXT[notice]}
            {notice === 'linked' && Number.isInteger(created) ? ` ${created} added.` : ''}
          </p>
        ) : null}
        {isFormError(error) ? <p className="office-flash office-flash--error">{ERROR_TEXT[error]}</p> : null}
      </div>

      {strip ? (
        <section className="office-strip" aria-label="How complete the list is">
          <p className="office-strip__total">{officeCopy.members.total(strip.total)}</p>
          <ul>
            {strip.noEmailAny + strip.noPhone === 0 ? <li>{officeCopy.members.complete}</li> : null}
            {strip.noEmail > 0 ? <li>{officeCopy.members.noEmail(strip.noEmail)}</li> : null}
            {strip.noPhone > 0 ? <li>{officeCopy.members.noPhone(strip.noPhone)}</li> : null}
            {strip.noBoth > 0 ? <li>{officeCopy.members.noBoth(strip.noBoth)}</li> : null}
            {dupes ? <li>{officeCopy.members.duplicate(dupes)}. Look for the &ldquo;Shared email&rdquo; label below.</li> : null}
          </ul>
        </section>
      ) : null}

      <details className="office-box" open={isFormError(error) && error !== 'forbidden'}>
        <summary>Add a member</summary>
        <form method="post" action={`${api}/members`} className="office-form">
          <label>
            First name
            <input name="firstName" required maxLength={100} autoComplete="off" />
          </label>
          <label>
            Last name
            <input name="lastName" required maxLength={100} autoComplete="off" />
          </label>
          <fieldset>
            <legend>Roles (pick at least one)</legend>
            <div className="office-checks">
              {MEMBER_ROLES.map((r) => (
                <label key={r} className="office-check">
                  <input type="checkbox" name="roles" value={r} defaultChecked={r === 'supporter'} /> {ROLE_LABELS[r]}
                </label>
              ))}
            </div>
          </fieldset>
          <label>
            Email (optional)
            <input name="email" type="email" maxLength={254} autoComplete="off" />
          </label>
          <label>
            Phone (optional)
            <input name="phone" type="tel" maxLength={40} autoComplete="off" />
          </label>
          <button type="submit" className="btn btn--style-primary btn--size-large">Add member</button>
        </form>
      </details>

      <form method="get" action={base} className="office-filters" role="search">
        <label>
          Search by name or email
          <input name="q" type="search" defaultValue={query.q} maxLength={80} />
        </label>
        <label>
          Status
          <select name="status" defaultValue={query.status ?? ''}>
            <option value="">Active and past</option>
            <option value="active">Active</option>
            <option value="past">Past</option>
          </select>
        </label>
        <label>
          Role
          <select name="role" defaultValue={query.role ?? ''}>
            <option value="">Any role</option>
            {MEMBER_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn--style-primary btn--size-medium">Search</button>
      </form>
      <p className="office-chips" aria-label="Quick filters">
        {chip('Active', { status: 'active' }, query.status === 'active')}
        {chip('Past', { status: 'past' }, query.status === 'past')}
        {chip('Juniors', { juniors: true }, query.juniors)}
        {MISSING_KEYS.map((k) => chip(MISSING_LABELS[k], { missing: k }, query.missing === k))}
        <a className="office-chip" href={base}>Clear filters</a>
      </p>

      {eraseRow ? (
        <section className="office-box office-box--danger" aria-labelledby="erase-title">
          <h2 id="erase-title">Remove personal details for {eraseRow.name}?</h2>
          <p>This blanks their email, phone, address, date of birth, emergency contact and notes, and marks them as a past member. It cannot be undone. Their roles and any money records stay.</p>
          <form method="post" action={`${api}/members/erase`} className="office-form">
            <input type="hidden" name="id" value={eraseRow.id} />
            <label className="office-check">
              <input type="checkbox" name="confirm" value="yes" required /> Yes, remove their personal details for good
            </label>
            <div className="office-actions">
              <button type="submit" className="btn btn--style-primary btn--size-medium">Remove personal details</button>
              <a className="club-button-link" href={`${base}${queryString(query)}`}>Cancel</a>
            </div>
          </form>
        </section>
      ) : null}

      <div className="office-actions">
        <form method="post" action={`${api}/members/link-players`}>
          <button type="submit" className="btn btn--style-primary btn--size-medium">Add members for players who have none</button>
        </form>
      </div>

      {dir && dir.rows.length === 0 ? <p className="club-attention__none">No members match. Clear the filters, or add the first member above.</p> : null}
      {dir && dir.rows.length > 0 ? (
        <>
          <p className="club-muted" aria-live="polite">
            {dir.total} {dir.total === 1 ? 'member' : 'members'} match. Page {dir.page} of {dir.totalPages}.
          </p>
          <table className="club-table office-table" role="table">
            <thead role="rowgroup">
              <tr role="row">
                <th scope="col" role="columnheader">Name</th>
                <th scope="col" role="columnheader">Roles</th>
                <th scope="col" role="columnheader">Email</th>
                <th scope="col" role="columnheader">Phone</th>
                <th scope="col" role="columnheader">Actions</th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              {dir.rows.map((r) => (
                <tr key={r.id} role="row">
                  <th scope="row" role="rowheader" data-label="Name">
                    <a href={`${admin}/collections/members/${r.id}`}>{r.name}</a>
                    <span className="office-tags">
                      {r.status === 'past' ? <span className="club-pill">Past</span> : null}
                      {r.junior ? <span className="club-pill">Junior</span> : null}
                      {r.junior && !r.hasGuardian ? <span className="club-pill club-pill--error">No guardian</span> : null}
                      {r.doNotEmail ? <span className="club-pill">Do not email</span> : null}
                      {r.status === 'active' && r.playedThisSeason ? <span className="club-pill">Played this season</span> : null}
                      {dupeIds.has(r.id) ? <span className="club-pill club-pill--error">Shared email</span> : null}
                    </span>
                  </th>
                  <td role="cell" data-label="Roles">{r.roles.map((x) => (x in ROLE_LABELS ? ROLE_LABELS[x as keyof typeof ROLE_LABELS] : x)).join(', ') || 'None'}</td>
                  <td role="cell" data-label="Email">{r.erased ? 'Removed' : (r.email ?? 'Missing')}</td>
                  <td role="cell" data-label="Phone">{r.erased ? 'Removed' : (r.phone ?? 'Missing')}</td>
                  <td role="cell" data-label="Actions">
                    <a href={`${admin}/collections/members/${r.id}`} aria-label={`Edit ${r.name}`}>Edit</a>
                    {r.erased ? null : (
                      <>
                        {' '}
                        &middot; <a href={`${base}${queryString({ ...query })}${queryString(query) ? '&' : '?'}erase=${r.id}`} aria-label={`Remove details for ${r.name}`}>Remove details</a>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <nav className="office-pager" aria-label="Pages">
            {dir.page > 1 ? <a href={`${base}${queryString({ ...query, page: dir.page - 1 })}`}>Previous page</a> : <span />}
            {dir.page < dir.totalPages ? <a href={`${base}${queryString({ ...query, page: dir.page + 1 })}`}>Next page</a> : <span />}
          </nav>
        </>
      ) : null}

      <form method="post" action={`${api}/export/members`} className="office-box office-form">
        <h2>Download as a spreadsheet</h2>
        <p>Downloads everyone who matches the filters above. The download is logged.</p>
        {query.q ? <input type="hidden" name="q" value={query.q} /> : null}
        {query.status ? <input type="hidden" name="status" value={query.status} /> : null}
        {query.role ? <input type="hidden" name="role" value={query.role} /> : null}
        {query.juniors ? <input type="hidden" name="age" value="junior" /> : null}
        {query.missing ? <input type="hidden" name="missing" value={query.missing} /> : null}
        <label className="office-check">
          <input type="checkbox" name="sensitive" value="yes" /> Include date of birth, emergency contact and notes
        </label>
        <div className="office-actions">
          <button type="submit" className="btn btn--style-primary btn--size-medium">Download CSV</button>
        </div>
      </form>
    </AdminPage>
  )
}
