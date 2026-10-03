/* eslint-disable @next/next/no-img-element */
import Link from 'next/link'
import { Panel } from '@/components/playhq/player-stats-tables'
import { SponsorCard, type Sponsor } from '@/components/sponsor-logos'
import { GameRows } from '@/components/playhq/game-rows'
import { SubHeading } from '@/components/stats/sub-heading'
import type { Game } from '@/lib/playhq/types'
import { messageParagraphs, type ResultSummary, type SeasonHonour } from '@/lib/stats/yearbook'

/** Page-sized sections of a yearbook. Each starts on its own printed page region (`print-section`). */
export function YearbookMessages({ items }: { items: { title: string; text: string }[] }) {
  const shown = items.filter((i) => messageParagraphs(i.text).length > 0)
  if (!shown.length) return null
  return (
    <section aria-labelledby="yb-messages" className="print-section space-y-6">
      <SubHeading id="yb-messages" title="From the club" />
      <div className="grid gap-6 lg:grid-cols-2">
        {shown.map((m) => (
          <article key={m.title} className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-brand-black/5 sm:p-8">
            <h3 className="display text-2xl text-brand-black">{m.title}</h3>
            <div className="mt-4 space-y-3 text-base leading-relaxed text-brand-charcoal">
              {messageParagraphs(m.text).map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

export function YearbookOverview({ summary }: { summary: ResultSummary }) {
  const tiles = [
    { label: 'Played', value: summary.played },
    { label: 'Won', value: summary.won },
    { label: 'Lost', value: summary.lost },
    { label: 'Drawn or other', value: summary.other },
    { label: 'Win rate', value: summary.winRate === null ? '–' : `${summary.winRate}%` },
  ]
  return (
    <section aria-labelledby="yb-overview" className="print-section space-y-6">
      <SubHeading id="yb-overview" title="The season in numbers" />
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl bg-white p-5 shadow-card ring-1 ring-brand-black/5">
            <dt className="eyebrow">{t.label}</dt>
            <dd className="display mt-2 text-4xl tabular-nums text-brand-black">{t.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export function YearbookResults({ byGrade, season }: { byGrade: { grade: string; games: Game[] }[]; season: string }) {
  if (!byGrade.length) return null
  return (
    <section aria-labelledby="yb-results" className="print-section space-y-6">
      <SubHeading id="yb-results" title="Results by grade" />
      <div className="space-y-4">
        {byGrade.map((g) => (
          <details key={g.grade} className="group rounded-2xl bg-white shadow-card ring-1 ring-brand-black/5" open={byGrade.length === 1}>
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 [&::-webkit-details-marker]:hidden">
              <span className="display text-xl text-brand-black">{g.grade}</span>
              <span className="rounded-full bg-brand-gold-pale px-2.5 py-0.5 text-xs font-semibold tabular-nums text-brand-gold-deep">{g.games.length}</span>
            </summary>
            <div className="px-2 pb-3">
              <GameRows games={g.games} variant="result" season={season} showTeam={false} showDate caption={`${g.grade} results`} />
            </div>
          </details>
        ))}
      </div>
    </section>
  )
}

export function YearbookHonours({ items }: { items: SeasonHonour[] }) {
  if (!items.length) return null
  return (
    <section aria-labelledby="yb-honours" className="print-section space-y-6">
      <SubHeading id="yb-honours" title="Honours this season" count={items.length} />
      <Panel title="Honour board">
        <ul className="divide-y divide-brand-black/5">
          {items.map((h, i) => (
            <li key={`${h.playerId}-${h.title}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-4 px-3 py-2.5">
              <Link href={`/players/${h.slug}`} className="font-semibold text-brand-black hover:text-brand-gold-deep hover:underline">{h.name}</Link>
              <span className="text-sm text-brand-charcoal">{h.title}<span className="text-brand-grey-light"> ({h.years})</span></span>
            </li>
          ))}
        </ul>
      </Panel>
    </section>
  )
}

export function YearbookPhotos({ photos, title }: { photos: { id: number; url: string; caption: string }[]; title: string }) {
  const shown = photos.filter((p) => p.url)
  if (!shown.length) return null
  return (
    <section aria-labelledby="yb-photos" className="print-section space-y-6">
      <SubHeading id="yb-photos" title="Photos" count={shown.length} />
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        {shown.map((p) => (
          <li key={p.id} className="overflow-hidden rounded-xl bg-brand-stone ring-1 ring-brand-black/5">
            <img src={p.url} alt={p.caption || `${title} photo`} loading="lazy" className="aspect-[4/3] h-full w-full object-cover" />
          </li>
        ))}
      </ul>
    </section>
  )
}

export function YearbookSponsors({ sponsors }: { sponsors: Sponsor[] }) {
  if (!sponsors.length) return null
  return (
    <section aria-labelledby="yb-sponsors" className="print-section space-y-6">
      <SubHeading id="yb-sponsors" title="Our sponsors" count={sponsors.length} />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {sponsors.map((s) => <SponsorCard key={s.id} sponsor={s} tier="Silver" />)}
      </div>
    </section>
  )
}
