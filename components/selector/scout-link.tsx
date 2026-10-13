import Link from 'next/link'
import { selectorPaths } from '@/config/site'
import type { Resolved } from '@/lib/scouting/resolve-opponent'

/** "Scout <club>" for an upcoming game. Two stored clubs with the same name list both; no match says so (builder only), never a guess. */
export function ScoutLink({ resolved, name, showNone = false }: { resolved: Resolved | undefined; name: string; showNone?: boolean }) {
  const cls = 'inline-flex min-h-11 items-center text-sm font-semibold text-brand-black underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-black'
  if (!resolved || resolved.kind === 'none') return showNone ? <p className="text-sm text-brand-grey">No stored games against this club.</p> : null
  if (resolved.kind === 'one') return <Link href={selectorPaths.scoutingFor(resolved.key)} className={cls}>Scout {name}</Link>
  return (
    <p className="flex flex-wrap items-center gap-x-3 text-sm text-brand-grey">
      <span>Several clubs match this name:</span>
      {resolved.candidates.map((c) => <Link key={c.key} href={selectorPaths.scoutingFor(c.key)} className={cls}>Scout {c.label}</Link>)}
    </p>
  )
}
