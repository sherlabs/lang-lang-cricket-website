import Link from 'next/link'
import { cn } from '@/lib/utils'
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
  const reached = achieved.slice(0, Math.ceil(max / 2)).map((a) => ({ key: `a-${a.playerId}-${a.key}-${a.threshold}`, name: a.name, slug: a.slug, text: describeAchieved(a, windowLabel) }))
  const close = approaching.slice(0, max).map((a) => ({ key: `p-${a.playerId}-${a.key}-${a.threshold}`, name: a.name, slug: a.slug, text: describeApproaching(a) }))
  const fromMatches = matchItems.slice(0, max).map((i) => ({ key: i.key, name: i.name, slug: i.slug, text: i.label }))
  return (
    <section aria-labelledby="milestones-heading" className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <h2 id="milestones-heading" className="display text-2xl text-brand-black sm:text-3xl">{heading}</h2>
          <span className="h-px flex-1 bg-brand-black/10" aria-hidden />
        </div>
        <p className="text-sm text-brand-grey">{note}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <MilestoneList title="Reached" items={reached} />
        <MilestoneList title="Approaching" items={close} />
        {fromMatches.length > 0 && (
          <MilestoneList
            title="Reached, from match data"
            note={`${matchSince ? `Counted since ${matchSince}. ` : ''}Milestones crossed this season, not lifetime totals.`}
            items={fromMatches}
            className="lg:col-span-2"
          />
        )}
      </div>
    </section>
  )
}

type MilestoneItem = { key: string; name: string; slug: string; text: string }

/** One milestone group as a card of compact rows (name left, what they reached right), so a long list stays short. */
function MilestoneList({ title, note, items, className }: { title: string; note?: string; items: MilestoneItem[]; className?: string }) {
  if (items.length === 0) return null
  return (
    <div className={cn('rounded-2xl bg-white shadow-card ring-1 ring-brand-black/5', className)}>
      <div className="flex items-baseline justify-between gap-3 border-b border-brand-black/10 px-5 py-3">
        <h3 className="eyebrow">{title}</h3>
        <span className="text-xs tabular-nums text-brand-grey">{items.length}</span>
      </div>
      {note && <p className="px-5 pt-3 text-xs text-brand-grey">{note}</p>}
      <ul className={cn('divide-y divide-brand-black/5 px-5 py-1', className && 'sm:columns-2 sm:gap-10 sm:[&>li]:break-inside-avoid')}>
        {items.map((i) => (
          <li key={i.key} className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
            <Link href={`/players/${i.slug}`} className="font-heading text-lg font-bold leading-tight text-brand-black hover:text-brand-gold-deep hover:underline">{i.name}</Link>
            <span className="text-sm text-brand-charcoal sm:text-right">{i.text}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
