/* eslint-disable @next/next/no-img-element */
import Link from 'next/link'
import { unstable_noStore as noStore } from 'next/cache'
import { getSyncStatus, listPlayersAdmin, type AdminPlayerRow } from './actions'
import { initials } from '@/lib/players/view'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { AdminCard, Badge, EmptyState } from '@/components/admin/admin-card'
import { TextInput } from '@/components/admin/fields'
import { PlayerSyncForm } from '@/components/admin/players/player-sync-form'
import { Button, buttonVariants } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'
// runPlayerSync is POSTed to this route, so it runs under this segment's limit, not the cron route's.
export const maxDuration = 300

type Status = 'all' | 'active' | 'past' | 'hidden'
type Props = { searchParams: { status?: string | string[]; q?: string | string[] } }

const TABS: { value: Status; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'past', label: 'Past' },
  { value: 'hidden', label: 'Hidden' },
]

const matchesStatus = (p: AdminPlayerRow, s: Status) =>
  s === 'hidden' ? p.hidden : s === 'active' ? !p.hidden && p.active : s === 'past' ? !p.hidden && !p.active : true

const melbourne = new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Australia/Melbourne' })

function tabHref(status: Status, q: string) {
  const params = new URLSearchParams()
  if (status !== 'all') params.set('status', status)
  if (q) params.set('q', q)
  const qs = params.toString()
  return qs ? `/admin/players?${qs}` : '/admin/players'
}

const statusLabel = (p: AdminPlayerRow) => (p.hidden ? 'Hidden' : p.active ? 'Active' : 'Past')

export default async function PlayersAdminPage({ searchParams }: Props) {
  noStore()
  const rawStatus = typeof searchParams.status === 'string' ? searchParams.status : ''
  const status: Status = TABS.find((t) => t.value === rawStatus)?.value ?? 'all'
  const q = typeof searchParams.q === 'string' ? searchParams.q.trim() : ''
  const [all, run] = await Promise.all([listPlayersAdmin(), getSyncStatus()])

  const needle = q.toLowerCase()
  const searched = needle ? all.filter((p) => p.name.toLowerCase().includes(needle)) : all
  const shown = searched.filter((p) => matchesStatus(p, status))

  return (
    <main>
      <AdminPageHeader
        eyebrow="Players"
        title="Players"
        intro="Senior players are synced from PlayHQ every night. Add photos, bios and honours here; they're never overwritten by the sync."
      >
        <Link href="/admin/players/new" className={buttonVariants({ variant: 'brand', size: 'xl' })}>
          Add past player
        </Link>
      </AdminPageHeader>

      <AdminCard title="PlayHQ sync" className="mb-8">
        <div className="flex flex-col gap-4">
          {run ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-brand-grey">
              <span>
                Last run <span className="font-medium text-brand-black">{melbourne.format(run.startedAt)}</span>
              </span>
              <Badge>{run.status === 'ok' ? 'OK' : run.status === 'running' ? 'Running' : 'Error'}</Badge>
              {run.status === 'ok' && (
                <span>
                  {run.playersCreated} new players, {run.seasonRows} season rows
                </span>
              )}
              {run.status === 'error' && run.error && <span className="break-words text-red-700">{run.error}</span>}
            </div>
          ) : (
            <p className="text-sm text-brand-grey">No sync has run yet.</p>
          )}
          <PlayerSyncForm />
        </div>
      </AdminCard>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Filter players" className="-mx-1 flex gap-1 overflow-x-auto px-1">
          {TABS.map((t) => {
            const n = searched.filter((p) => matchesStatus(p, t.value)).length
            const current = t.value === status
            return (
              <Link
                key={t.value}
                href={tabHref(t.value, q)}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-sm font-medium ring-1 transition',
                  current
                    ? 'bg-brand-black text-white ring-brand-black'
                    : 'bg-white text-brand-black ring-brand-black/10 hover:ring-brand-gold'
                )}
              >
                {t.label}
                <span className={cn('tabular-nums', current ? 'text-white/70' : 'text-brand-grey')}>{n}</span>
              </Link>
            )
          })}
        </nav>
        <form method="get" action="/admin/players" role="search" className="flex gap-2">
          {status !== 'all' && <input type="hidden" name="status" value={status} />}
          <TextInput name="q" type="search" defaultValue={q} placeholder="Search by name" aria-label="Search players" className="min-w-0 flex-1 sm:w-60 sm:flex-none" />
          <Button type="submit" variant="outline" size="xl">
            Search
          </Button>
        </form>
      </div>

      <AdminCard title="All players" aside={<span className="text-sm text-brand-grey">{shown.length} shown</span>} flush>
        {shown.length === 0 ? (
          <EmptyState>
            {all.length === 0 ? 'No players yet — run a sync or add a past player.' : 'No players match this filter.'}
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5 sm:pl-6" />
                <TableHead>Name</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Seasons</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-5 text-right sm:pr-6">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((p) => (
                <TableRow key={p.id} className="border-brand-black/5">
                  <TableCell className="pl-5 sm:pl-6">
                    {p.photoUrl ? (
                      <img src={p.photoUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-stone text-xs font-semibold text-brand-grey">
                        {initials(p.name)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Link href={`/admin/players/${p.id}`} className="font-medium text-brand-black hover:text-brand-gold-deep hover:underline">
                      {p.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge>{p.source === 'manual' ? 'Manual' : 'PlayHQ'}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-brand-grey">{p.seasonsCount}</TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        'inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold',
                        p.hidden
                          ? 'bg-brand-stone text-brand-grey ring-1 ring-brand-black/10'
                          : p.active
                            ? 'bg-brand-black text-white'
                            : 'bg-brand-gold-pale text-brand-gold-deep ring-1 ring-brand-gold/30'
                      )}
                    >
                      {statusLabel(p)}
                    </span>
                  </TableCell>
                  <TableCell className="pr-5 text-right sm:pr-6">
                    <Link
                      href={`/admin/players/${p.id}`}
                      className={buttonVariants({ variant: 'outline', size: 'sm', className: 'min-h-11' })}
                    >
                      Edit
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </AdminCard>
    </main>
  )
}
