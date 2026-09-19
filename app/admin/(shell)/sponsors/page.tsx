/* eslint-disable @next/next/no-img-element */
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowUpRight01Icon } from '@hugeicons/core-free-icons'
import { listSponsors, removeSponsor } from './actions'
import { SponsorForm } from '@/components/admin/sponsor-form'
import { TIER_ORDER } from '@/components/sponsor-logos'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { AdminCard, Badge, EmptyState } from '@/components/admin/admin-card'
import { ConfirmDelete, EditDialog } from '@/components/admin/row-actions'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const dynamic = 'force-dynamic'

export default async function SponsorsAdminPage() {
  const items = await listSponsors()
  const rank = (tier: string) => Math.max(0, (TIER_ORDER as readonly string[]).indexOf(tier))
  const sorted = [...items].sort((a, b) => rank(a.tier) - rank(b.tier) || a.name.localeCompare(b.name))
  return (
    <main>
      <AdminPageHeader
        eyebrow="Sponsors"
        title="Club sponsors"
        intro="Logos on the homepage and Sponsors page. Tiers show in order Platinum, Gold, Silver, Bronze, then Player sponsors."
      />

      <AdminCard title="Add a sponsor" className="mb-8">
        <SponsorForm />
      </AdminCard>

      <AdminCard title="All sponsors" aside={<span className="text-sm text-brand-grey">{items.length} total</span>} flush>
        {sorted.length === 0 ? (
          <EmptyState>No sponsors yet — add one above.</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5 sm:pl-6">Logo</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Website</TableHead>
                <TableHead className="pr-5 text-right sm:pr-6">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((s) => (
                <TableRow key={s.id} className="border-brand-black/5">
                  <TableCell className="pl-5 sm:pl-6">
                    <span className="flex h-12 w-20 items-center justify-center rounded-md bg-white p-1 ring-1 ring-brand-black/10">
                      {s.logoUrl ? (
                        <img src={s.logoUrl} alt="" className="max-h-full max-w-full object-contain" />
                      ) : (
                        <span className="text-[10px] text-brand-grey-light">No logo</span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-normal font-medium text-brand-black">{s.name}</TableCell>
                  <TableCell>
                    <Badge>{s.tier}</Badge>
                  </TableCell>
                  <TableCell>
                    {s.linkUrl ? (
                      <a
                        href={s.linkUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-11 max-w-[16rem] items-center gap-1 truncate text-sm font-medium text-brand-gold-deep hover:underline"
                      >
                        <span className="truncate">{s.linkUrl.replace(/^https?:\/\//, '')}</span>
                        <HugeiconsIcon icon={ArrowUpRight01Icon} className="h-4 w-4 shrink-0" aria-hidden />
                      </a>
                    ) : (
                      <span className="text-brand-grey">—</span>
                    )}
                  </TableCell>
                  <TableCell className="pr-5 text-right sm:pr-6">
                    <div className="inline-flex items-center gap-1">
                      <EditDialog title="Edit sponsor">
                        <SponsorForm sponsor={s} />
                      </EditDialog>
                      <ConfirmDelete name={s.name} action={removeSponsor.bind(null, s.id)} />
                    </div>
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
