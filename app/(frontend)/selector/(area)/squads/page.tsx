import type { Metadata } from 'next'
import Link from 'next/link'
import { SquadGradeView } from '@/components/selector/squad-grade'
import { selectorPaths } from '@/config/site'
import { requireSelection } from '@/lib/selector-auth'
import { loadSquadBoard } from '@/lib/selector-squad-queries'

export const metadata: Metadata = { title: 'Squads', robots: { index: false, follow: false } }

type Props = { searchParams: Promise<{ grade?: string }> }

export default async function SquadsPage({ searchParams }: Props) {
  const user = await requireSelection(selectorPaths.squads)
  const sp = await searchParams
  const board = await loadSquadBoard(user)
  const grade = board.grades.find((g) => g.gradeId === sp.grade) ?? board.grades[0]
  return (
    <main className="container-site max-w-4xl py-6 sm:py-10">
      <h1 className="display text-3xl text-brand-black">Squads</h1>
      <p className="mt-2 text-sm text-brand-grey">Who is in each grade for the {board.year} season. A player can be in more than one.</p>
      {!grade ? (
        <p className="mt-6 rounded-xl bg-white p-5 text-sm text-brand-grey ring-1 ring-brand-black/10">There are no grades yet. Squads are made from the upcoming games: press Refresh fixtures on the Availability page.</p>
      ) : (
        <>
          <nav aria-label="Grades" className="-mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1">
            {board.grades.map((g) => (
              <Link key={g.gradeId} href={`${selectorPaths.squads}?grade=${encodeURIComponent(g.gradeId)}`} aria-current={g.gradeId === grade.gradeId ? 'page' : undefined} className={`inline-flex min-h-11 shrink-0 items-center rounded-lg px-4 text-sm font-semibold ${g.gradeId === grade.gradeId ? 'bg-brand-black text-white' : 'border border-brand-black/20 bg-white text-brand-black'}`}>
                {g.gradeName} ({g.cards.length})
              </Link>
            ))}
          </nav>
          <div className="mt-5">
            <SquadGradeView key={grade.squadId} grade={grade} others={board.grades.filter((g) => g.squadId !== grade.squadId).map((g) => ({ squadId: g.squadId, gradeName: g.gradeName }))} />
          </div>
        </>
      )}
    </main>
  )
}
