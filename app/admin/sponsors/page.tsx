import { listSponsors } from './actions'
import { SponsorForm } from '@/components/admin/sponsor-form'
import { TIER_ORDER } from '@/components/sponsor-logos'

export const dynamic = 'force-dynamic'

export default async function SponsorsAdminPage() {
  const items = await listSponsors()
  const groups = TIER_ORDER.map((tier) => ({ tier, items: items.filter((s) => s.tier === tier) })).filter(
    (g) => g.items.length > 0
  )
  return (
    <main>
      <h1 className="mb-1 text-xl font-semibold">Sponsors</h1>
      <p className="mb-4 text-sm text-neutral-600">
        {items.length} sponsors. Tiers show in order Platinum → Gold → Silver → Bronze → Player. Logos are resized in your
        browser before upload.
      </p>

      <section className="mb-8 max-w-md rounded border p-3">
        <h2 className="mb-2 font-medium">Add sponsor</h2>
        <SponsorForm />
      </section>

      {groups.map(({ tier, items }) => (
        <section key={tier} className="mb-8">
          <h2 className="mb-2 font-medium">
            {tier} <span className="text-neutral-500">({items.length})</span>
          </h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((s) => (
              <li key={s.id} className="rounded border p-3">
                <SponsorForm sponsor={s} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  )
}
