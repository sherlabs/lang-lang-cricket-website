import { listDocuments, createDocument, removeDocument } from './actions'

export const dynamic = 'force-dynamic'

export default async function DocumentsAdminPage() {
  const docs = await listDocuments()
  return (
    <main>
      <h1 className="mb-4 text-xl font-semibold">Documents</h1>
      <form action={createDocument} className="mb-6 flex flex-wrap gap-2">
        <select name="category" required className="rounded border px-2 py-1">
          <option>Codes of Conduct</option>
          <option>Policies</option>
          <option>Child Safety</option>
          <option>Game Day</option>
          <option>CCCA Directory</option>
        </select>
        <input name="title" placeholder="Title" required className="rounded border px-2 py-1" />
        <input type="file" name="file" accept="application/pdf" required />
        <button type="submit" className="rounded bg-emerald-700 px-3 py-1 text-white">
          Add
        </button>
      </form>
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            <th>Category</th>
            <th>Title</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => (
            <tr key={d.id} className="border-t">
              <td>{d.category}</td>
              <td>
                <a href={d.url} target="_blank" className="underline">
                  {d.title}
                </a>
              </td>
              <td>
                <form
                  action={async () => {
                    'use server'
                    await removeDocument(d.id)
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
