import Link from 'next/link'
import { notFound } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowUpRight01Icon } from '@hugeicons/core-free-icons'
import { deleteManualPlayerAndReturn, getPlayerAdmin, listPlayersAdmin, updatePlayer, type AdminPlayerRow } from '../actions'
import { playerName, seasonYears, teamLabel } from '@/lib/players/view'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { AdminCard, Badge, EmptyState } from '@/components/admin/admin-card'
import { ActionForm, SubmitButton } from '@/components/admin/action-form'
import { ConfirmDelete } from '@/components/admin/row-actions'
import { PlayerFields } from '@/components/admin/players/player-fields'
import { HonoursEditor } from '@/components/admin/players/honours-editor'
import { MergePlayerForm } from '@/components/admin/players/merge-player-form'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const dynamic = 'force-dynamic'

const yearsHint = (p: AdminPlayerRow) =>
  p.source === 'manual' ? p.manualYears || 'manual' : `${p.seasonsCount} season${p.seasonsCount === 1 ? '' : 's'}`

export default async function PlayerAdminPage({ params }: { params: { id: string } }) {
  noStore()
  const id = Number(params.id)
  const [data, all] = await Promise.all([getPlayerAdmin(id), listPlayersAdmin()])
  if (!data) notFound()
  const { player, honours, aliases, seasons } = data
  const name = playerName(player)
  const isManual = player.source === 'manual'
  const mergeOptions = all.filter((p) => p.id !== player.id).map((p) => ({ id: p.id, name: p.name, yearsHint: yearsHint(p) }))

  return (
    <main>
      <Link href="/admin/players" className="mb-4 inline-flex min-h-11 items-center text-sm text-brand-grey hover:text-brand-black">
        ← All players
      </Link>
      <AdminPageHeader eyebrow="Players" title={name}>
        <div className="flex flex-wrap items-center gap-3">
          <Badge>{isManual ? 'Manual' : 'PlayHQ'}</Badge>
          {player.hidden ? (
            <span className="text-sm text-brand-grey">Hidden from the website</span>
          ) : (
            <a
              href={`/players/${player.slug}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-gold-deep hover:underline"
            >
              View public profile
              <HugeiconsIcon icon={ArrowUpRight01Icon} className="h-4 w-4" aria-hidden />
            </a>
          )}
        </div>
      </AdminPageHeader>

      <div className="flex flex-col gap-8">
        <AdminCard title="Profile">
          <ActionForm action={updatePlayer} successText="Saved.">
            <PlayerFields player={player} />
            <div>
              <SubmitButton>Save changes</SubmitButton>
            </div>
          </ActionForm>
        </AdminCard>

        <AdminCard title="Honours & roles" description="Shown on the public profile in this order.">
          <HonoursEditor playerId={player.id} initial={honours.map((h) => ({ years: h.years, title: h.title }))} />
        </AdminCard>

        {!isManual && (
          <AdminCard
            title="From PlayHQ"
            description="Read-only. Rewritten by every sync."
            aside={<span className="text-sm text-brand-grey">{seasons.length} season rows</span>}
            flush
          >
            <div className="border-b border-brand-black/5 px-5 py-4 sm:px-6">
              <p className="text-sm font-medium text-brand-black">Name keys</p>
              {aliases.length === 0 ? (
                <p className="mt-1 text-sm text-brand-grey">None.</p>
              ) : (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {aliases.map((a) => (
                    <li key={a} className="break-all rounded-md bg-brand-stone px-2 py-1 font-mono text-xs text-brand-charcoal">
                      {a}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {seasons.length === 0 ? (
              <EmptyState>No seasons recorded.</EmptyState>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-5 sm:pl-6">Season</TableHead>
                    <TableHead>Team</TableHead>
                    <TableHead className="text-right">M</TableHead>
                    <TableHead className="text-right">Runs</TableHead>
                    <TableHead className="pr-5 text-right sm:pr-6">Wkts</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {seasons.map((s) => (
                    <TableRow key={s.id} className="border-brand-black/5">
                      <TableCell className="pl-5 font-medium text-brand-black sm:pl-6">{seasonYears(s.seasonName)}</TableCell>
                      <TableCell className="text-brand-grey">{teamLabel(s.teamName)}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.games}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.batRuns}</TableCell>
                      <TableCell className="pr-5 text-right tabular-nums sm:pr-6">{s.bowlWickets}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </AdminCard>
        )}

        <AdminCard title="Merge" description="Use when PlayHQ lists the same person under two names (e.g. Jon / Jonathan).">
          <MergePlayerForm sourceId={player.id} sourceName={name} options={mergeOptions} />
        </AdminCard>

        {isManual && (
          <AdminCard title="Delete player" description="Removes this manually added player, their honours and profile.">
            <ConfirmDelete name={name} action={deleteManualPlayerAndReturn.bind(null, player.id)} />
          </AdminCard>
        )}
      </div>
    </main>
  )
}
