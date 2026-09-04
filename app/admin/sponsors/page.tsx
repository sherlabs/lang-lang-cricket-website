import { listSponsors, createSponsor, removeSponsor, editSponsor } from './actions'

export const dynamic = 'force-dynamic'

export default async function SponsorsAdminPage() {
  const items = await listSponsors()
  return (
    <main>
      <h1 className="mb-4 text-xl font-semibold">Sponsors</h1>
      <form action={createSponsor} className="mb-6 flex flex-wrap gap-2">
        <select name="tier" required className="rounded border px-2 py-1">
          <option>Platinum</option>
          <option>Gold</option>
          <option>Silver</option>
          <option>Bronze</option>
        </select>
        <input name="name" placeholder="Name" required className="rounded border px-2 py-1" />
        <input type="file" name="file" accept="image/*" required />
        <input name="linkUrl" placeholder="Link URL" className="rounded border px-2 py-1" />
        <button type="submit" className="rounded bg-emerald-700 px-3 py-1 text-white">
          Add
        </button>
      </form>
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            <th>Tier</th>
            <th>Name</th>
            <th>Logo</th>
            <th>Link</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((s) => (
            <tr key={s.id} className="border-t">
              <td colSpan={5}>
                <div className="flex flex-wrap items-center gap-2 py-1">
                  <form action={editSponsor} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={s.id} />
                    <select
                      name="tier"
                      defaultValue={s.tier}
                      required
                      className="rounded border px-2 py-1"
                    >
                      <option>Platinum</option>
                      <option>Gold</option>
                      <option>Silver</option>
                      <option>Bronze</option>
                    </select>
                    <input
                      name="name"
                      defaultValue={s.name}
                      required
                      className="rounded border px-2 py-1"
                    />
                    <a href={s.logoUrl} target="_blank" className="underline">
                      current logo
                    </a>
                    <input type="file" name="file" accept="image/*" />
                    <input
                      name="linkUrl"
                      defaultValue={s.linkUrl}
                      placeholder="Link URL"
                      className="rounded border px-2 py-1"
                    />
                    <button type="submit" className="rounded bg-emerald-700 px-3 py-1 text-white">
                      Save
                    </button>
                  </form>
                  <form
                    action={async () => {
                      'use server'
                      await removeSponsor(s.id)
                    }}
                  >
                    <button type="submit" className="text-red-600">
                      Delete
                    </button>
                  </form>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
