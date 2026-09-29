import { createManualPlayer } from '../actions'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { AdminCard } from '@/components/admin/admin-card'
import { ActionForm, SubmitButton } from '@/components/admin/action-form'
import { PlayerFields } from '@/components/admin/players/player-fields'

export const dynamic = 'force-dynamic'

export default function NewPlayerPage() {
  return (
    <main>
      <AdminPageHeader
        eyebrow="Players"
        title="Add past player"
        intro="For players from before PlayHQ. They appear under Past players unless you set them Active."
      />
      <AdminCard>
        {/* createManualPlayer redirects to the new player's page; a server-action redirect resolves
            (doesn't reject) on the client, so ActionForm only shows validation errors. */}
        <ActionForm action={createManualPlayer}>
          <PlayerFields />
          <div>
            <SubmitButton>Add player</SubmitButton>
          </div>
        </ActionForm>
      </AdminCard>
    </main>
  )
}
