/**
 * The club office module registry (wave D spec section 1). One list drives the landing page, its stat lines, the help section and
 * the tests, so a module cannot appear in one place and not another. A module is added here in the same change that builds it.
 */
import { emailEnabled } from '../email/env'

export type OfficeModuleKey = 'members' | 'fees' | 'volunteers' | 'meetings' | 'diary' | 'email'
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
  {
    key: 'fees',
    label: 'Fees',
    hint: 'Membership types, match fees, payments and who owes what. Admins only.',
    path: '/office/fees',
    role: 'admin',
    doc: 'membership-fees',
    collections: ['membership-tiers', 'memberships', 'fee-seasons', 'fee-charges', 'fee-payments', 'fee-waivers'],
  },
  {
    key: 'volunteers',
    label: 'Volunteers',
    hint: 'Who is helping on each game day, and the hours they give.',
    path: '/office/volunteers',
    role: 'staff',
    doc: 'volunteer-roster',
    collections: ['volunteer-weeks', 'volunteer-shifts', 'volunteer-assignments', 'volunteer-availability', 'volunteer-hours'],
  },
  {
    key: 'meetings',
    label: 'Meetings',
    hint: 'Agendas, attendance, motions, actions and minutes, the committee seats, and office-bearer documents.',
    path: '/office/meetings',
    role: 'staff',
    doc: 'committee-meetings',
    collections: ['committee-seats', 'meeting-templates', 'meetings', 'meeting-items', 'meeting-attendance', 'meeting-motions', 'meeting-actions', 'committee-documents', 'office-files'],
  },
  {
    key: 'diary',
    label: 'Diary & plan',
    hint: 'The jobs the club does each season, who owns them, and the strategic plan they belong to.',
    path: '/office/diary',
    role: 'staff',
    doc: 'season-diary-and-plan',
    collections: ['diary-jobs', 'plan-pillars', 'plan-objectives'],
  },
  {
    key: 'email',
    label: 'Email',
    hint: 'Write to your members. Each person can unsubscribe. Admins only.',
    path: '/office/email',
    role: 'admin',
    doc: 'bulk-email',
    collections: ['email-campaigns', 'email-recipients', 'email-suppressions'],
  },
]

/** The modules a role may see on the landing page. Anyone who is not admin or editor sees none. */
export function modulesFor(role: string | null | undefined, emailOn: boolean = emailEnabled()): OfficeModule[] {
  // The Email module exists only while outbound mail is configured: no tile, no page, nothing to click.
  const live = officeModules.filter((m) => m.key !== 'email' || emailOn)
  if (role === 'admin') return live
  if (role === 'editor') return live.filter((m) => m.role === 'staff')
  return []
}
