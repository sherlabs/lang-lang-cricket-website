import type { Player } from '@/db/schema'
import { Field, Select, TextArea, TextInput } from '@/components/admin/fields'
import { PhotoUploadField } from '@/components/admin/photo-upload-field'

/** Shared between the add-past-player page and the player editor; field names match the server actions. */
export function PlayerFields({ player }: { player?: Player }) {
  const p = player ? `player-${player.id}` : 'player-new'
  const manual = !player || player.source === 'manual'
  return (
    <>
      {player && <input type="hidden" name="id" value={player.id} />}
      <Field label="Photo" htmlFor={`${p}-photo`}>
        <PhotoUploadField id={`${p}-photo`} name="photoUrl" initialUrl={player?.photoUrl} prefix="players" maxEdge={800} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor={`${p}-first`}>
          <TextInput id={`${p}-first`} name="firstName" defaultValue={player?.firstName} required />
        </Field>
        <Field label="Last name" htmlFor={`${p}-last`}>
          <TextInput id={`${p}-last`} name="lastName" defaultValue={player?.lastName} />
        </Field>
      </div>
      {manual && (
        <Field label="Years at the club" htmlFor={`${p}-years`} hint="Shown on the card, e.g. 1978–1992.">
          <TextInput id={`${p}-years`} name="manualYears" defaultValue={player?.manualYears} />
        </Field>
      )}
      <Field label="Bio" htmlFor={`${p}-bio`} hint="Plain text. Leave a blank line between paragraphs.">
        <TextArea id={`${p}-bio`} name="bio" defaultValue={player?.bio} rows={6} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Status"
          htmlFor={`${p}-status`}
          hint={manual ? 'Manual players are Past unless set Active.' : 'Auto = active if they played this season or last.'}
        >
          <Select id={`${p}-status`} name="activeOverride" defaultValue={player?.activeOverride ?? 'auto'}>
            <option value="auto">Auto</option>
            <option value="active">Active</option>
            <option value="past">Past</option>
          </Select>
        </Field>
        {player && (
          <label className="flex min-h-11 items-center gap-2 self-end text-sm text-brand-black sm:pb-6">
            <input
              type="checkbox"
              name="hidden"
              defaultChecked={player.hidden}
              className="h-5 w-5 rounded border border-brand-black/25 accent-brand-gold-deep"
            />
            Hide from the website
          </label>
        )}
      </div>
    </>
  )
}
