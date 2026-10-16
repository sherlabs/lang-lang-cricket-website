import { btnPrimary, field } from '@/components/selector/styles'
import { voteWord } from '@/lib/votes/ballot'

type Option = { id: number; name: string }

/**
 * The ballot: one native `<select>` per place, labelled "3 votes", "2 votes"... from the club's ballot values. It is a plain form
 * with a server action, so it works with no JavaScript (the browser's own `required` check helps; the server checks again).
 * `hidden` carries which link and game; who is voting is decided by the signed cookie, never by these fields.
 */
export function BallotForm({ action, hidden, options, values, places, existing, submitLabel }: { action: (formData: FormData) => void | Promise<void>; hidden: Record<string, string>; options: readonly Option[]; values: readonly number[]; places: number; existing: readonly { place: number; playerId: number }[]; submitLabel: string }) {
  const chosen = new Map(existing.map((p) => [p.place, p.playerId]))
  return (
    <form action={action} className="space-y-4">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {Array.from({ length: places }, (_, i) => i + 1).map((place) => (
        <label key={place} className="block text-sm font-medium text-brand-black" htmlFor={`place_${place}`}>
          {voteWord(values[place - 1])}
          <select id={`place_${place}`} name={`place_${place}`} required defaultValue={chosen.get(place) ? String(chosen.get(place)) : ''} className={`${field} mt-1`}>
            <option value="">Choose a player</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </label>
      ))}
      <button type="submit" className={`${btnPrimary} w-full`}>{submitLabel}</button>
    </form>
  )
}
