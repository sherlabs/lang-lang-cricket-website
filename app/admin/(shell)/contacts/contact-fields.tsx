import { Field, TextInput } from '@/components/admin/fields'

export const LEADERSHIP_ROLE = 'Senior Leadership Team'

type Contact = { id: number; role: string; name: string; phone: string; email: string; sortOrder: number }

/** Shared between the add card and the edit dialog; field names match the server actions. */
export function ContactFields({ contact, roles }: { contact?: Contact; roles: string[] }) {
  const p = contact ? `contact-${contact.id}` : 'contact-new'
  const options = Array.from(new Set([LEADERSHIP_ROLE, ...roles]))
  return (
    <>
      {contact && <input type="hidden" name="id" value={contact.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Role"
          htmlFor={`${p}-role`}
          hint={
            <>
              Use <strong>{LEADERSHIP_ROLE}</strong> to list this person in the leadership section of the contact page.
            </>
          }
        >
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
        <Field label="Phone" htmlFor={`${p}-phone`}>
          <TextInput id={`${p}-phone`} name="phone" type="tel" defaultValue={contact?.phone} placeholder="Optional" />
        </Field>
        <Field label="Email" htmlFor={`${p}-email`}>
          <TextInput id={`${p}-email`} name="email" type="email" defaultValue={contact?.email} placeholder="Optional" />
        </Field>
        <Field label="Sort order" htmlFor={`${p}-sort`} hint="Lower numbers show first.">
          <TextInput id={`${p}-sort`} name="sortOrder" type="number" defaultValue={contact?.sortOrder ?? 0} className="sm:w-32" />
        </Field>
      </div>
    </>
  )
}
