import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowLeft01Icon, CalendarDaysIcon, ExternalLinkIcon, MapPinIcon } from '@hugeicons/core-free-icons'
import { PageHeader } from '@/components/page-header'
import { ScorecardInnings } from '@/components/playhq/scorecard-innings'
import { getGameSummaryAuto, PlayHQError } from '@/lib/playhq'
import type { Innings, Scorecard } from '@/lib/playhq/types'
import { formatIsoMelbourne, PLAYHQ_CLUB_URL } from '@/lib/playhq/format'

export const revalidate = 900

type Props = { params: { gameId: string } }

const isMissing = (e: unknown) => e instanceof PlayHQError && (e.status === 400 || e.status === 404)

async function load(gameId: string): Promise<Scorecard | null> {
  try {
    return await getGameSummaryAuto(gameId)
  } catch (e) {
    if (isMissing(e)) return null
    throw e
  }
}

function sides(sc: Scorecard) {
  const club = sc.teams.find((t) => t.isClub) ?? sc.teams[0]
  const opp = sc.teams.find((t) => t.id !== club.id) ?? club
  return { club, opp }
}

/** PlayHQ returns placeholder 2nd innings for two-day games that never went there; hide those. */
const played = (i: Innings) =>
  i.total.overs > 0 || i.total.runs > 0 || i.total.wickets > 0 || i.batting.some((b) => b.balls > 0 || b.runs > 0)

/** `${runs}` per innings joined with ` & ` — e.g. `4/237 dec & 8/120`. */
function totalsFor(sc: Scorecard, teamId: string) {
  const inns = sc.innings.filter((i) => i.battingTeamId === teamId && played(i))
  if (!inns.length) return ''
  return inns
    .map((i) => {
      const t = i.total
      const wk = t.allOut || t.wickets >= 10 ? '' : `${t.wickets}/`
      return `${wk}${t.runs}${t.declared ? ' dec' : ''}`
    })
    .join(' & ')
}

function buildResult(sc: Scorecard): string | null {
  const { club, opp } = sides(sc)
  const o = club.outcome
  if (sc.status === 'ABANDONED' || o === 'ABANDONED') return 'Match abandoned'
  if (!o) return null
  if (o === 'WON_BY_FORFEIT') return `${club.name} won by forfeit`
  if (o === 'LOST_BY_FORFEIT') return `${club.name} lost by forfeit`
  if (o === 'DRAW' || o === 'DREW') return `${club.name} drew with ${opp.name}`
  if (o === 'TIE' || o === 'TIED') return `${club.name} tied with ${opp.name}`
  if (o === 'NO_RESULT') return 'No result'
  const c = [club.name, totalsFor(sc, club.id)].filter(Boolean).join(' ')
  const p = [opp.name, totalsFor(sc, opp.id)].filter(Boolean).join(' ')
  const suffix = o.endsWith('_ON_FIRST_INNINGS') ? ' on first innings' : ''
  if (o.startsWith('WON')) return `${c} defeated ${p}${suffix}`
  if (o.startsWith('LOST')) return `${c} lost to ${p}${suffix}`
  return `${c} v ${p}`
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const sc = await load(params.gameId).catch(() => null)
  if (!sc) return { title: 'Scorecard | Lang Lang Cricket Club' }
  const { club, opp } = sides(sc)
  return { title: `${club.name} v ${opp.name} scorecard | Lang Lang Cricket Club` }
}

export default async function GamePage({ params }: Props) {
  const sc = await load(params.gameId)
  if (!sc) notFound()

  const { club, opp } = sides(sc)
  const result = buildResult(sc)
  const date = sc.startsAt ? formatIsoMelbourne(sc.startsAt) : null
  const eyebrow = [sc.gradeName, sc.roundName].filter(Boolean).join(' · ')
  const innings = sc.innings.filter(played)
  const pending = innings.length === 0

  return (
    <main>
      <PageHeader eyebrow={eyebrow || 'Scorecard'} title={`${club.name} v ${opp.name}`}>
        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/75">
          {date && (
            <span className="inline-flex items-center gap-1.5">
              <HugeiconsIcon icon={CalendarDaysIcon} className="h-4 w-4 text-brand-gold" aria-hidden />
              {date}
            </span>
          )}
          {sc.venueName && (
            <span className="inline-flex items-center gap-1.5">
              <HugeiconsIcon icon={MapPinIcon} className="h-4 w-4 text-brand-gold" aria-hidden />
              {sc.venueName}
            </span>
          )}
        </div>
        {result && <p className="mt-6 max-w-2xl text-xl font-bold text-white">{result}</p>}
        {sc.toss && <p className="mt-2 text-sm text-white/75">{sc.toss}</p>}
        <Link
          href="/fixtures"
          className="mt-8 inline-flex min-h-11 items-center gap-2 rounded-md border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-brand-gold hover:text-brand-gold"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} className="h-4 w-4" aria-hidden />
          All fixtures &amp; results
        </Link>
      </PageHeader>

      <section className="container-site py-16 lg:py-24">
        {pending ? (
          <div className="rounded-2xl bg-brand-stone p-8 text-center text-sm text-brand-grey-light">
            {sc.status === 'FINAL'
              ? 'No scorecard has been published for this match.'
              : 'Scorecard will appear once the match is complete.'}
          </div>
        ) : (
          <div className="space-y-8">
            {innings.map((i) => (
              <ScorecardInnings key={i.sequenceNo} innings={i} />
            ))}
          </div>
        )}

        <p className="mt-12 text-sm text-brand-grey">
          Scorecard data from PlayHQ.{' '}
          <a
            href={PLAYHQ_CLUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-brand-gold-deep underline underline-offset-2 hover:text-brand-black"
          >
            View the club on PlayHQ
            <HugeiconsIcon icon={ExternalLinkIcon} className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </p>
      </section>
    </main>
  )
}
