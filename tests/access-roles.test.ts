import { describe, expect, it } from 'vitest'
import { isAdmin, isAdminUser, isSelection, isSelectionUser, isSelectorUser, isStaff, isStaffUser, selectionOr, staffOr } from '../payload/access'

const u = (role: string, extra: Record<string, unknown> = {}) => ({ id: 1, role, ...extra })
const req = (user: unknown) => ({ req: { user } }) as never

describe('role helpers (spec section 2 truth table)', () => {
  const table: Array<[string, unknown, { admin: boolean; staff: boolean; selection: boolean; selector: boolean }]> = [
    ['admin', u('admin'), { admin: true, staff: true, selection: true, selector: false }],
    ['editor', u('editor'), { admin: false, staff: true, selection: true, selector: false }],
    ['selector', u('selector'), { admin: false, staff: false, selection: true, selector: true }],
    ['disabled admin', u('admin', { disabled: true }), { admin: false, staff: false, selection: false, selector: false }],
    ['disabled editor', u('editor', { disabled: true }), { admin: false, staff: false, selection: false, selector: false }],
    ['disabled selector', u('selector', { disabled: true }), { admin: false, staff: false, selection: false, selector: false }],
    ['anonymous', null, { admin: false, staff: false, selection: false, selector: false }],
    ['unknown role', u('guest'), { admin: false, staff: false, selection: false, selector: false }],
    ['no role', { id: 5 }, { admin: false, staff: false, selection: false, selector: false }],
  ]
  for (const [label, user, want] of table) {
    it(label, () => {
      expect(isAdminUser(user as never)).toBe(want.admin)
      expect(isStaffUser(user as never)).toBe(want.staff)
      expect(isSelectionUser(user as never)).toBe(want.selection)
      expect(isSelectorUser(user as never)).toBe(want.selector)
      expect(isAdmin(req(user))).toBe(want.admin)
      expect(isStaff(req(user))).toBe(want.staff)
      expect(isSelection(req(user))).toBe(want.selection)
    })
  }

  it('staffOr gives staff everything and everyone else the filter', () => {
    const where = { status: { equals: 'published' } }
    expect(staffOr(where)(req(u('editor')))).toBe(true)
    expect(staffOr(where)(req(u('selector')))).toEqual(where)
    expect(staffOr(where)(req(null))).toEqual(where)
    expect(staffOr(where)(req(u('editor', { disabled: true })))).toEqual(where)
  })

  it('selectionOr includes selectors', () => {
    const where = { id: { equals: 9 } }
    expect(selectionOr(where)(req(u('selector')))).toBe(true)
    expect(selectionOr(where)(req(null))).toEqual(where)
  })
})
