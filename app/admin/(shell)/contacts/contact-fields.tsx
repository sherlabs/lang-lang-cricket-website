import { Field, Select, TextInput } from '@/components/admin/fields'
import { PhotoUploadField } from '@/components/admin/photo-upload-field'
import { PEOPLE_SECTIONS, sectionOf } from '@/lib/people'

type Contact = {
  id: number
  role: string
  name: string
  phone: string
  email: string
  photoUrl: string
  section: string
  sortOrder: number
}

/** Shared between the add card and the edit dialog; field names match the server actions. */
export function ContactFields({ contact, roles }: { contact?: Contact; roles: string[] }) {
  const p = contact ? `contact-${contact.id}` : 'contact-new'
  const options = Array.from(new Set(roles.filter(Boolean)))
  return (
    <>
      {contact && <input type="hidden" name="id" value={contact.id} />}
      <Field label="Photo" htmlFor={`${p}-photo`}>
        <PhotoUploadField name="photoUrl" initialUrl={contact?.photoUrl} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Group" htmlFor={`${p}-section`} hint="Which section of the Our People page they appear in.">
          <Select id={`${p}-section`} name="section" defaultValue={sectionOf(contact?.section)}>
            {PEOPLE_SECTIONS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.key === 'coach' ? 'Junior Coach' : s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Role" htmlFor={`${p}-role`} hint="Shown on their card, e.g. President, Secretary or U12s Coach.">
          <TextInput id={`${p}-role`} name="role" list={`${p}-roles`} defaultValue={contact?.role} placeholder="e.g. President" required />
          <datalist id={`${p}-roles`}>
            {options.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </Field>
        <Field label="Name" htmlFor={`${p}-name`}>
          <TextInput id={`${p}-name`} name="name" defaultValue={contact?.name} required />
        </Field>
        <Field label="Sort order" htmlFor={`${p}-sort`} hint="Lower numbers show first within their group.">
          <TextInput id={`${p}-sort`} name="sortOrder" type="number" defaultValue={contact?.sortOrder ?? 0} className="sm:w-32" />
        </Field>
        <Field label="Phone" htmlFor={`${p}-phone`}>
          <TextInput id={`${p}-phone`} name="phone" type="tel" defaultValue={contact?.phone} placeholder="Optional" />
        </Field>
        <Field label="Email" htmlFor={`${p}-email`}>
          <TextInput id={`${p}-email`} name="email" type="email" defaultValue={contact?.email} placeholder="Optional" />
        </Field>
      </div>
    </>
  )
}
