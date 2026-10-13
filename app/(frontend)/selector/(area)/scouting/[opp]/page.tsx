import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ScoutPrintButton } from '@/components/selector/scout-print-button'
import { ScoutingReportView } from '@/components/selector/scouting-report'
import { selectorPaths } from '@/config/site'
import { getClub } from '@/lib/club'
import { requireSelection } from '@/lib/selector-auth'
import { loadScoutingReport } from '@/lib/selector-scouting-queries'

// The title never carries the key or the club: an unknown key must not be echoed anywhere.
export const metadata: Metadata = { title: 'Scouting report', robots: { index: false, follow: false } }
// Opposition players are named behind this route: never static, never cached.
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ opp: string }> }

const decode = (raw: string): string | null => {
  try {
    return decodeURIComponent(raw)
  } catch {
    return null
  }
}

/** One opposition's scouting report. An unknown key is the standard 404, with nothing built from the key. */
export default async function ScoutingReportPage({ params }: Props) {
  const { opp } = await params
  const key = decode(opp)
  const user = await requireSelection(key ? selectorPaths.scoutingFor(key) : selectorPaths.scouting)
  if (!key) notFound()
  const report = await loadScoutingReport(user, key)
  if (!report) notFound()
  const club = await getClub()
  return (
    <main className="container-site max-w-3xl py-6 sm:py-10">
      <p className="scout-hide"><Link href={selectorPaths.scouting} className="inline-flex min-h-11 items-center font-semibold text-brand-black underline underline-offset-4">All clubs</Link></p>
      <p className="scout-show hidden text-sm font-semibold uppercase tracking-wide">{club.shortName} · scouting report · third-party names, for selection use only</p>
      <h1 className="display text-3xl text-brand-black">{report.label}</h1>
      <div className="mt-3"><ScoutPrintButton /></div>
      <div className="mt-4"><ScoutingReportView report={report} locale={club.locale} /></div>
    </main>
  )
}
