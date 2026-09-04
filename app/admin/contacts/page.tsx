import { listContacts, createContact, removeContact } from './actions'

export const dynamic = 'force-dynamic'

export default async function ContactsAdminPage() {
  const contacts = await listContacts()
  return (
    <main>
      <h1 className="mb-4 text-xl font-semibold">Contacts</h1>
      <form action={createContact} className="mb-6 flex flex-wrap gap-2">
        <input name="role" placeholder="Role" required className="rounded border px-2 py-1" />
        <input name="name" placeholder="Name" required className="rounded border px-2 py-1" />
        <input name="phone" placeholder="Phone" className="rounded border px-2 py-1" />
        <input name="email" placeholder="Email" className="rounded border px-2 py-1" />
        <input
          type="number"
          name="sortOrder"
          placeholder="Sort order"
          defaultValue={0}
          className="w-28 rounded border px-2 py-1"
        />
        <button type="submit" className="rounded bg-emerald-700 px-3 py-1 text-white">
          Add
        </button>
      </form>
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            <th>Role</th>
            <th>Name</th>
            <th>Phone</th>
            <th>Email</th>
            <th>Sort</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {contacts.map((c) => (
            <tr key={c.id} className="border-t">
              <td>{c.role}</td>
              <td>{c.name}</td>
              <td>{c.phone}</td>
              <td>{c.email}</td>
              <td>{c.sortOrder}</td>
              <td>
                <form
                  action={async () => {
                    'use server'
                    await removeContact(c.id)
                  }}
                >
                  <button type="submit" className="text-red-600">
                    Delete
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
