import Link from 'next/link'
import { CLUB_LOCALE } from '@/config/site'
import type { ProfilePartnerships } from '@/lib/stats/match/profile'
import { formatCoverageDate } from '@/lib/stats/match/coverage'
import { ordinal } from '@/lib/stats/rank'

const ordinalWicket = (n: number) => `${ordinal(n)} wicket`

/**
 * A player's best stands, inferred from batting order and fall of wickets (`inferred`, never exact).
 * Pairs with a hidden partner are never listed: only the anonymous total line appears.
 */
export function PartnershipList({ data }: { data: ProfilePartnerships }) {
  return (
    <div className="space-y-4 text-sm">
      {data.top.length > 0 && (
        <ol className="divide-y divide-brand-black/5 rounded-2xl bg-white ring-1 ring-brand-black/5">
          {data.top.map((p) => (
            <li key={p.key} className="flex items-center gap-4 px-4 py-3">
              <span className="display w-16 text-right text-2xl tabular-nums text-brand-black">{p.runs}{p.unbroken ? '*' : ''}</span>
              <div className="min-w-0 flex-1">
                <p className="text-brand-charcoal">
                  with{' '}
                  {p.partnerSlug ? <Link href={`/players/${p.partnerSlug}`} className="font-semibold text-brand-black hover:text-brand-gold-deep hover:underline">{p.partnerName}</Link> : <span className="font-semibold text-brand-black">{p.partnerName}</span>}
                </p>
                <p className="truncate text-xs text-brand-grey">
                  {[ordinalWicket(p.wicket) + (p.unbroken ? ', unbroken' : ''), p.date ? formatCoverageDate(p.date, CLUB_LOCALE) : null, p.grade].filter(Boolean).join(' · ')}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
      {data.bestPartner && (
        <p className="text-brand-charcoal">
          Most runs together:{' '}
          {data.bestPartner.slug ? <Link href={`/players/${data.bestPartner.slug}`} className="font-semibold text-brand-black hover:underline">{data.bestPartner.name}</Link> : <span className="font-semibold">{data.bestPartner.name}</span>}
          {' '}({data.bestPartner.runs} runs in {data.bestPartner.stands} stands).
        </p>
      )}
      {data.others.count > 0 && (
        <p className="text-brand-charcoal">
          Partnerships with other club players: {data.others.count}, best {data.others.best}.
        </p>
      )}
      <p className="text-brand-grey">
        An asterisk marks an unbroken stand. Pairs are inferred from batting order and fall of wickets and include extras.
        {` ${data.inningsAvailable} of ${data.inningsTotal} innings could be paired.`}
        {data.unavailable ? ` ${data.unavailable.charAt(0).toUpperCase()}${data.unavailable.slice(1)}.` : ''}
      </p>
    </div>
  )
}
