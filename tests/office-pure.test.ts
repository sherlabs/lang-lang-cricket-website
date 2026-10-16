import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { officeCopy } from '../payload/admin/copy'
import { auditFilterSummary, juniorCutoff, memberWhere, parseMemberQuery, queryString } from '../lib/office/member-filters'
import { sanitiseSummary } from '../lib/office/audit'
import { looksLikeCardNumber, noCardNumbers } from '../lib/office/card'
import { exportOriginOk } from '../lib/office/export-gate'
import { memberExportTable } from '../lib/office/member-export'
import { isValidEmail, normaliseEmail, normalisePhone, validateQuickAdd } from '../lib/office/member-input'
import { displayNameFor, memberIsJunior, MEMBER_ROLES, shortNameFor } from '../lib/office/members'
import { modulesFor, officeModules } from '../lib/office/modules'
import { projectNames, SCREEN_ROLES } from '../lib/office/names'
import { DEFAULT_ADDRESS_LABELS, resolveOfficeSettings } from '../lib/office/settings'
import { csvCell } from '../lib/stats/csv'

describe('card numbers are refused in free text', () => {
  it('flags Luhn-valid 13 to 19 digit runs, with separators or padding', () => {
    expect(looksLikeCardNumber('4111 1111 1111 1111')).toBe(true)
    expect(looksLikeCardNumber('ref 4111-1111-1111-1111 paid')).toBe(true)
    expect(looksLikeCardNumber('5500005555555559')).toBe(true)
    expect(looksLikeCardNumber('99 4111111111111111 99')).toBe(true)
  })
  it('lets phone numbers, short references and invalid long numbers through', () => {
    expect(looksLikeCardNumber('0400 123 456')).toBe(false)
    expect(looksLikeCardNumber('Invoice 20261012')).toBe(false)
    expect(looksLikeCardNumber('4111 1111 1111 1112')).toBe(false)
    expect(looksLikeCardNumber(null)).toBe(false)
    expect(noCardNumbers('call me on 0400 123 456')).toBe(true)
    expect(typeof noCardNumbers('4111111111111111')).toBe('string')
  })
})

describe('member names', () => {
  it('a linked player wins over the typed name; erased members are anonymous', () => {
    expect(displayNameFor({ firstName: 'Typed', lastName: 'Name', player: { displayName: 'Sam Taylor' } })).toBe('Sam Taylor')
    expect(displayNameFor({ firstName: 'Pat', lastName: 'Lee' })).toBe('Pat Lee')
    expect(displayNameFor({ firstName: 'Pat', lastName: 'Lee', preferredName: 'Patty' })).toBe('Patty')
    expect(displayNameFor({ person: { name: 'Robin Hall' } })).toBe('Robin Hall')
    expect(displayNameFor({})).toBe('Unnamed member')
    expect(displayNameFor({ firstName: 'Pat', lastName: 'Lee', erasedAt: '2026-01-01' })).toBe('Former member')
  })
  it('short names are first name and last initial', () => {
    expect(shortNameFor({ firstName: 'Sam', lastName: 'taylor' })).toBe('Sam T.')
    expect(shortNameFor({ player: { firstName: 'Alex', lastName: 'Jones', displayName: 'Lexi J' } })).toBe('Alex J.')
    expect(shortNameFor({ person: { name: 'Robin Hall' } })).toBe('Robin H.')
    expect(shortNameFor({ firstName: 'Sam', erasedAt: 'x' })).toBe('Former member')
  })
  it('junior follows the socials rule: player flag, or a date of birth under 18 (unreadable counts as junior)', () => {
    expect(memberIsJunior({ player: { isJunior: true } }, '2026-10-12')).toBe(true)
    expect(memberIsJunior({ dateOfBirth: '2012-03-01' }, '2026-10-12')).toBe(true)
    expect(memberIsJunior({ dateOfBirth: '1990-03-01' }, '2026-10-12')).toBe(false)
    expect(memberIsJunior({ dateOfBirth: 'garbage' }, '2026-10-12')).toBe(true)
    expect(memberIsJunior({}, '2026-10-12')).toBe(false)
  })
})

describe('quick add validation', () => {
  const ok = { firstName: ' Sam ', lastName: 'Taylor', roles: ['player', 'bogus'], email: ' Sam@Example.COM ', phone: ' 0400   123 456 ' }
  it('trims, lowercases and keeps only real roles', () => {
    const r = validateQuickAdd(ok, MEMBER_ROLES)
    expect(r).toEqual({ ok: true, value: { firstName: 'Sam', lastName: 'Taylor', roles: ['player'], email: 'sam@example.com', phone: '0400 123 456' } })
  })
  it('saves empty email and phone as null', () => {
    expect(validateQuickAdd({ ...ok, email: '  ', phone: '' }, MEMBER_ROLES)).toMatchObject({ ok: true, value: { email: null, phone: null } })
  })
  it('refuses a missing name, no roles, a bad email and a card number', () => {
    expect(validateQuickAdd({ ...ok, firstName: '' }, MEMBER_ROLES)).toEqual({ ok: false, code: 'name' })
    expect(validateQuickAdd({ ...ok, roles: ['bogus'] }, MEMBER_ROLES)).toEqual({ ok: false, code: 'roles' })
    expect(validateQuickAdd({ ...ok, email: 'nope' }, MEMBER_ROLES)).toEqual({ ok: false, code: 'email' })
    expect(validateQuickAdd({ ...ok, phone: '4111 1111 1111 1111' }, MEMBER_ROLES)).toEqual({ ok: false, code: 'phone' })
    expect(validateQuickAdd({ ...ok, firstName: 'x'.repeat(101) }, MEMBER_ROLES)).toEqual({ ok: false, code: 'name-long' })
  })
  it('normalisers', () => {
    expect(normaliseEmail(' A@B.CO ')).toBe('a@b.co')
    expect(normaliseEmail(' ')).toBeNull()
    expect(normalisePhone(null)).toBeNull()
    expect(isValidEmail('a@b.co')).toBe(true)
    expect(isValidEmail('a@b')).toBe(false)
  })
})

describe('directory filters', () => {
  it('drops unknown keys and values and clamps the page', () => {
    const q = parseMemberQuery({ status: 'weird', role: 'drop table', missing: 'x', page: '-3', evil: '1', q: '  Sam   Taylor ' })
    expect(q).toEqual({ q: 'Sam Taylor', status: null, role: null, juniors: false, missing: null, page: 1 })
    expect(memberWhere(q, '2026-10-12')).toEqual({ and: [{ or: expect.any(Array) }] })
    expect(memberWhere(parseMemberQuery({}), '2026-10-12')).toEqual({})
  })
  it('builds the chips as filters', () => {
    const w = (p: Record<string, string>) => JSON.stringify(memberWhere(parseMemberQuery(p), '2026-10-12'))
    expect(w({ missing: 'email' })).toContain('"email":{"exists":false}')
    expect(w({ missing: 'both' })).toContain('"phone":{"exists":false}')
    expect(w({ missing: 'guardian' })).toContain('"guardians":{"exists":false}')
    expect(w({ age: 'junior' })).toContain('2008-10-12')
    expect(w({ role: 'volunteer' })).toContain('"roles":{"equals":"volunteer"}')
    expect(w({ status: 'past' })).toContain('"status":{"equals":"past"}')
  })
  it('page, cutoff and address round trip', () => {
    expect(parseMemberQuery({ page: '3' }).page).toBe(3)
    expect(juniorCutoff('2026-10-12')).toBe('2008-10-12')
    expect(queryString({ q: 'a b', role: 'coach', page: 2 })).toBe('?q=a+b&role=coach&page=2')
    expect(queryString({})).toBe('')
  })
  it('the audit filter summary never holds the search text', () => {
    const s = auditFilterSummary(parseMemberQuery({ q: 'secret name', role: 'coach' }))
    expect(JSON.stringify(s)).not.toContain('secret')
    expect(s).toMatchObject({ hasSearch: true, role: 'coach' })
  })
})

describe('audit summaries are keys and counts only', () => {
  const spec = { module: ['members'], count: 'number', flag: 'boolean' } as const
  it('drops free text, unknown keys and wrong types', () => {
    expect(sanitiseSummary({ module: 'members', count: 4, flag: true, name: 'Sam Taylor', email: 'a@b.co' }, spec)).toEqual({ module: 'members', count: 4, flag: true })
    expect(sanitiseSummary({ module: 'sam@example.com', count: '4', flag: 'yes' }, spec)).toEqual({})
    expect(sanitiseSummary({ count: Number.NaN }, spec)).toEqual({})
  })
})

describe('export origin rule', () => {
  const csrf = ['http://localhost:4200']
  it('accepts a listed Origin, or same-origin fetch metadata when there is no Origin; refuses the rest', () => {
    expect(exportOriginOk({ origin: 'http://localhost:4200', secFetchSite: null, csrf })).toBe(true)
    expect(exportOriginOk({ origin: 'https://evil.example', secFetchSite: 'same-origin', csrf })).toBe(false)
    expect(exportOriginOk({ origin: null, secFetchSite: 'same-origin', csrf })).toBe(true)
    expect(exportOriginOk({ origin: null, secFetchSite: 'cross-site', csrf })).toBe(false)
    expect(exportOriginOk({ origin: null, secFetchSite: null, csrf })).toBe(false)
  })
})

describe('members export table', () => {
  const m = {
    firstName: '=cmd|calc',
    lastName: 'X',
    roles: ['player', 'volunteer'],
    status: 'active',
    email: 'a@b.co',
    phone: '0400',
    dateOfBirth: '2010-05-05T00:00:00.000Z',
    emergencyContact: { name: 'Mum', phone: '0411', relationship: 'Parent' },
    notes: 'Allergic to nothing',
  }
  it('leaves out date of birth, emergency contact and notes unless ticked', () => {
    const plain = memberExportTable([m], DEFAULT_ADDRESS_LABELS, false)
    expect(plain.header).not.toContain('Date of birth')
    expect(JSON.stringify(plain.rows)).not.toContain('Mum')
    expect(JSON.stringify(plain.rows)).not.toContain('2010')
    const full = memberExportTable([m], DEFAULT_ADDRESS_LABELS, true)
    expect(full.header).toEqual(expect.arrayContaining(['Date of birth', 'Emergency contact name', 'Notes']))
    expect(full.rows[0]).toEqual(expect.arrayContaining(['2010-05-05', 'Mum', 'Allergic to nothing']))
    expect(full.rows[0]).toHaveLength(full.header.length)
  })
  it('uses the settings labels as address columns, and the CSV writer neutralises formulas', () => {
    const t = memberExportTable([m], { addressLine: 'Line', locality: 'Town', region: 'County', postalCode: 'Zip' }, false)
    expect(t.header).toEqual(expect.arrayContaining(['Line', 'Town', 'County', 'Zip']))
    expect(csvCell(t.rows[0][0])).toBe("'=cmd|calc X")
  })
})

describe('name projections for editors', () => {
  const rows = [
    { id: 1, firstName: 'Zed', lastName: 'Adult', roles: ['volunteer'] },
    { id: 2, firstName: 'Sam', lastName: 'Taylor', dateOfBirth: '2014-02-02', roles: ['volunteer', 'player'] },
    { id: 3, firstName: 'Pat', lastName: 'Parent', roles: ['parent'] },
    { id: 4, firstName: 'Old', lastName: 'Timer', roles: ['volunteer'], status: 'past' },
    { id: 5, firstName: 'Gone', lastName: 'Away', roles: ['volunteer'], erasedAt: '2026-01-01' },
    { id: 6, firstName: 'Cam', lastName: 'Coach', roles: ['coach'], email: 'x@y.co', phone: '1' },
  ]
  it('roster is volunteers and committee, juniors shortened, nothing else leaks', () => {
    const out = projectNames(rows, 'roster', '2026-10-12')
    expect(out).toEqual([{ id: 2, displayName: 'Sam T.' }, { id: 1, displayName: 'Zed Adult' }])
    for (const o of out) expect(Object.keys(o).sort()).toEqual(['displayName', 'id'])
  })
  it('stock adds players and coaches; actions is committee only; there is no all-members screen', () => {
    expect(projectNames(rows, 'stock', '2026-10-12').map((r) => r.id)).toEqual([6, 2, 1])
    expect(projectNames(rows, 'actions', '2026-10-12')).toEqual([])
    expect(Object.keys(SCREEN_ROLES).sort()).toEqual(['actions', 'roster', 'stock'])
  })
})

describe('honest numbers wording', () => {
  it('states what each count leaves out, for zero, one and many', () => {
    expect(officeCopy.members.noEmail(0)).toContain('0 active members have no email')
    expect(officeCopy.members.noEmail(1)).toContain('1 active member has no email')
    expect(officeCopy.members.noEmail(41)).toBe('41 active members have no email (past members and people on the do-not-email list are not counted)')
    expect(officeCopy.members.noPhone(9)).toContain('past members are not counted')
    expect(officeCopy.members.noBoth(3)).toContain('neither an email nor a phone')
    expect(officeCopy.members.stat(0, 0)).toBe('No members yet')
    expect(officeCopy.members.stat(1, 1)).toContain('1 active member, 1 with no email')
    expect(officeCopy.members.stat(312, 41)).toContain('do-not-email list are not counted')
  })
})

describe('office settings', () => {
  it('fills every gap with neutral defaults', () => {
    const s = resolveOfficeSettings(null)
    expect(s.addressLabels).toEqual(DEFAULT_ADDRESS_LABELS)
    expect(s.currency).toMatch(/^[A-Z]{3}$/)
    expect(resolveOfficeSettings({ currency: ' nzd ', addressLabels: { postalCode: 'Zip' } })).toMatchObject({ currency: 'NZD', addressLabels: { postalCode: 'Zip', region: 'Region' } })
  })
})

describe('module registry', () => {
  it('every module has a route view, a feature doc and a role-correct tile list', () => {
    for (const m of officeModules) {
      expect(m.path.startsWith('/office/')).toBe(true)
      expect(existsSync(path.resolve(__dirname, '..', 'docs', 'features', `${m.doc}.mdx`)), `${m.key} doc`).toBe(true)
    }
    expect(modulesFor('admin').map((m) => m.key)).toContain('members')
    expect(modulesFor('editor').map((m) => m.key)).not.toContain('members')
    expect(modulesFor('selector')).toEqual([])
    expect(modulesFor(null)).toEqual([])
  })
})
