/**
 * Groups for the people listed on /people and the Contact page. The value is
 * stored in `committee_contacts.section`; order here is display order.
 */
export const PEOPLE_SECTIONS = [
  { key: 'leadership', label: 'Senior Leadership Team' },
  { key: 'committee', label: 'Committee' },
  { key: 'coach', label: 'Junior Coaches' },
] as const

export type Section = (typeof PEOPLE_SECTIONS)[number]['key']

export const DEFAULT_SECTION: Section = 'committee'

/** Coerce a stored/submitted value to a known section; anything unknown is treated as committee. */
export function sectionOf(value: unknown): Section {
  return PEOPLE_SECTIONS.some((s) => s.key === value) ? (value as Section) : DEFAULT_SECTION
}

export function sectionLabel(value: unknown): string {
  const key = sectionOf(value)
  return PEOPLE_SECTIONS.find((s) => s.key === key)!.label
}

type Person = { section: string; sortOrder: number; name: string }

export type PeopleGroup<T extends Person> = { key: Section; label: string; people: T[] }

/**
 * Buckets rows by section in PEOPLE_SECTIONS order, each sorted by sortOrder
 * then name. Sections with nobody in them are omitted.
 */
export function groupPeople<T extends Person>(rows: readonly T[]): PeopleGroup<T>[] {
  const byName = (a: T, b: T) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
  return PEOPLE_SECTIONS.flatMap(({ key, label }) => {
    const people = rows.filter((r) => sectionOf(r.section) === key).sort(byName)
    return people.length ? [{ key, label, people }] : []
  })
}
