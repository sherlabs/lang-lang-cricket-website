/**
 * The club office module registry (wave D spec section 1). One list drives the landing page, its stat lines, the help section and
 * the tests, so a module cannot appear in one place and not another. A module is added here in the same change that builds it.
 */
export type OfficeModuleKey = 'members'
export type OfficeModule = {
  key: OfficeModuleKey
  label: string
  /** One plain sentence under the name. */
  hint: string
  /** Under the admin route, e.g. `/office/members`. */
  path: string
  /** `admin` modules are shown to admins only; `staff` modules to the committee too. */
  role: 'admin' | 'staff'
  /** The feature doc in `docs/features/` (without `.mdx`). */
  doc: string
  /** Collections the module reads, for the access matrix. */
  collections: string[]
}

export const officeModules: OfficeModule[] = [
  {
    key: 'members',
    label: 'Members',
    hint: 'Who is in the club, with contact details. Admins only.',
    path: '/office/members',
    role: 'admin',
    doc: 'member-directory',
    collections: ['members'],
  },
]

/** The modules a role may see on the landing page. Anyone who is not admin or editor sees none. */
export function modulesFor(role: string | null | undefined): OfficeModule[] {
  if (role === 'admin') return officeModules
  if (role === 'editor') return officeModules.filter((m) => m.role === 'staff')
  return []
}
