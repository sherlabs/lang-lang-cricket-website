import Link from 'next/link'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowRight01Icon } from '@hugeicons/core-free-icons'
import type { ClubTeam, Ladder } from '@/lib/playhq/types'
import { seasonHref } from '@/lib/playhq/format'

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

/** `4th of 8 · 9W 2L` for the club's row, or null when the ladder is missing. */
export function ladderLine(ladder: Ladder | null | undefined, teamId: string) {
  const row = ladder?.rows.find((r) => r.teamId === teamId)
  if (!ladder || !row) return null
  const parts = [`${ordinal(row.position)} of ${ladder.rows.length}`]
  const won = row.values.won
  const lost = row.values.lost
  if (typeof won === 'number' && typeof lost === 'number' && won + lost > 0) parts.push(`${won}W ${lost}L`)
  return parts.join(' · ')
}

type Props = { title: string; teams: ClubTeam[]; ladders: Map<string, Ladder | null>; season: string }

/** Small linked cards for one group of sides (Senior / Junior). */
export function TeamGrid({ title, teams, ladders, season }: Props) {
  if (!teams.length) return null
  return (
    <div>
      <h3 className="eyebrow">{title}</h3>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {teams.map((t) => {
          const standing = ladderLine(t.gradeId ? ladders.get(t.gradeId) : null, t.id)
          return (
            <li key={t.id}>
              <Link
                href={seasonHref('/fixtures', season, t.id)}
                className="group flex h-full items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-card ring-1 ring-brand-black/5 transition hover:shadow-card-hover hover:ring-brand-gold/40"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold tracking-tight text-brand-black group-hover:text-brand-gold-deep">{t.name}</span>
                  <span className="block truncate text-xs text-brand-grey-light">{t.gradeName ?? 'Grade not yet assigned'}</span>
                  {standing && <span className="mt-0.5 block text-xs font-semibold text-brand-charcoal">{standing}</span>}
                </span>
                <HugeiconsIcon icon={ArrowRight01Icon} className="h-4 w-4 shrink-0 text-brand-gold-deep transition group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
