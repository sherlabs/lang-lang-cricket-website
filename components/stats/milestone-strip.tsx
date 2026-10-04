import Link from 'next/link'
import { describeAchieved, describeApproaching, type BoardAchieved, type BoardApproaching } from '@/lib/stats/milestones'

/**
 * Public milestone strip (spec A8): players close to a round number, and those who crossed one
 * in the current season. Only drawn when there is something to say. The note states the
 * coverage caveat, since totals only count stored seasons unless a baseline was recorded.
 */
export function MilestoneStrip({
  heading,
  note,
  approaching,
  achieved,
  windowLabel,
  matchItems = [],
  matchSince = null,
  max = 8,
}: {
  heading: string
  note: string
  approaching: BoardApproaching[]
  achieved: BoardAchieved[]
  windowLabel: string | null
  /** Match-data milestones crossed in the newest stored season (name, slug, label). Never merged with the baseline-backed ones. */
  matchItems?: { key: string; name: string; slug: string; label: string }[]
  matchSince?: string | null
  max?: number
}) {
  if (approaching.length === 0 && achieved.length === 0 && matchItems.length === 0) return null
  const items = [
    ...achieved.slice(0, Math.ceil(max / 2)).map((a) => ({ key: `a-${a.playerId}-${a.key}-${a.threshold}`, kind: 'Reached', name: a.name, slug: a.slug, text: describeAchieved(a, windowLabel) })),
    ...approaching.slice(0, max).map((a) => ({ key: `p-${a.playerId}-${a.key}-${a.threshold}`, kind: 'Close', name: a.name, slug: a.slug, text: describeApproaching(a) })),
  ]
  return (
    <section aria-labelledby="milestones-heading" className="mb-12">
      <div className="flex items-center gap-3">
        <h2 id="milestones-heading" className="display text-2xl text-brand-black sm:text-3xl">{heading}</h2>
        <span className="h-px flex-1 bg-brand-black/10" aria-hidden />
      </div>
      <p className="mt-2 text-sm text-brand-grey">{note}</p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((i) => (
          <li key={i.key} className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-brand-black/5">
            <p className="eyebrow">{i.kind === 'Reached' ? 'Reached' : 'Approaching'}</p>
            <Link href={`/players/${i.slug}`} className="mt-1 block font-heading text-lg font-bold leading-tight text-brand-black hover:text-brand-gold-deep hover:underline">{i.name}</Link>
            <p className="mt-1 text-sm text-brand-charcoal">{i.text}</p>
          </li>
        ))}
      </ul>
      {matchItems.length > 0 && (
        <>
          <p className="mt-6 text-sm text-brand-grey">From match data{matchSince ? `, counted since ${matchSince}` : ''}: milestones crossed this season. These are not lifetime totals.</p>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {matchItems.slice(0, max).map((i) => (
              <li key={i.key} className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-brand-black/5">
                <p className="eyebrow">Reached (match data)</p>
                <Link href={`/players/${i.slug}`} className="mt-1 block font-heading text-lg font-bold leading-tight text-brand-black hover:text-brand-gold-deep hover:underline">{i.name}</Link>
                <p className="mt-1 text-sm text-brand-charcoal">{i.label}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
