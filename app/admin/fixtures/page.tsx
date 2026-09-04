import { listFixtures, createFixture, removeFixture, editFixture } from './actions'

export const dynamic = 'force-dynamic'

function toDatetimeLocal(date: Date | string) {
  const d = new Date(date)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default async function FixturesAdminPage() {
  const items = await listFixtures()
  return (
    <main>
      <h1 className="mb-4 text-xl font-semibold">Fixtures</h1>
      <form action={createFixture} className="mb-6 flex flex-wrap items-center gap-2">
        <input name="team" placeholder="Team" required className="rounded border px-2 py-1" />
        <input
          name="opponent"
          placeholder="Opponent"
          required
          className="rounded border px-2 py-1"
        />
        <input name="venue" placeholder="Venue" className="rounded border px-2 py-1" />
        <input
          type="datetime-local"
          name="matchDate"
          required
          className="rounded border px-2 py-1"
        />
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="isResult" />
          Result
        </label>
        <input
          name="resultSummary"
          placeholder="Result summary"
          className="rounded border px-2 py-1"
        />
        <button type="submit" className="rounded bg-emerald-700 px-3 py-1 text-white">
          Add
        </button>
      </form>
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            <th>Team</th>
            <th>Opponent</th>
            <th>Venue</th>
            <th>Date</th>
            <th>Result?</th>
            <th>Summary</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((f) => (
            <tr key={f.id} className="border-t">
              <td colSpan={7}>
                <div className="flex flex-wrap items-center gap-2 py-1">
                  <form
                    action={editFixture}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <input type="hidden" name="id" value={f.id} />
                    <input
                      name="team"
                      defaultValue={f.team}
                      required
                      className="rounded border px-2 py-1"
                    />
                    <input
                      name="opponent"
                      defaultValue={f.opponent}
                      required
                      className="rounded border px-2 py-1"
                    />
                    <input
                      name="venue"
                      defaultValue={f.venue}
                      className="rounded border px-2 py-1"
                    />
                    <input
                      type="datetime-local"
                      name="matchDate"
                      defaultValue={toDatetimeLocal(f.matchDate)}
                      required
                      className="rounded border px-2 py-1"
                    />
                    <label className="flex items-center gap-1 text-sm">
                      <input type="checkbox" name="isResult" defaultChecked={f.isResult} />
                      Result
                    </label>
                    <input
                      name="resultSummary"
                      defaultValue={f.resultSummary}
                      placeholder="Result summary"
                      className="rounded border px-2 py-1"
                    />
                    <button type="submit" className="rounded bg-emerald-700 px-3 py-1 text-white">
                      Save
                    </button>
                  </form>
                  <form
                    action={async () => {
                      'use server'
                      await removeFixture(f.id)
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
