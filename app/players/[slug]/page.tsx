import { JsonLd } from '@/components/json-ld'
import { playerJsonLd } from '@/lib/structured-data'
/* eslint-disable @next/next/no-img-element */
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { getPlayerProfile } from '@/lib/players/queries'
import { baseOpenGraph, canonicalFor } from "@/lib/site-metadata"
import { battingView, bowlingView, initials } from '@/lib/players/view'
import { PlayerSeasonTables } from '@/components/players/player-season-tables'

export const dynamic = 'force-dynamic'

type Props = { params: { slug: string } }

export async function generateMetadata({ params }: Props) {
  noStore()
  const profile = await getPlayerProfile(params.slug)
  if (!profile) return { title: 'Player | Lang Lang Cricket Club' }
  const summary = [profile.active ? 'Active player' : 'Past player', profile.yearsLabel, profile.grades.join(' · ')]
    .filter(Boolean)
    .join(' — ')
  return {
    alternates: canonicalFor(`/players/${profile.player.slug}`),
    title: `${profile.name} | Lang Lang Cricket Club`,
    description: `${summary}. Career stats and club honours at Lang Lang Cricket Club.`,
    // Share previews show the player's own photo when the club has added one.
    openGraph: profile.player.photoUrl
      ? { ...baseOpenGraph, images: [{ url: profile.player.photoUrl, alt: profile.name }] }
      : baseOpenGraph,
  }
}

export default async function PlayerPage({ params }: Props) {
  noStore()
  const profile = await getPlayerProfile(params.slug)
  if (!profile) notFound()
  const { player, career } = profile
  const bat = career ? battingView(career) : null
  const bowl = career ? bowlingView(career) : null
  const tiles: (readonly [string, string | number])[] =
    career && bat && bowl
      ? [
          ['Games', career.games],
          ['Runs', bat.runs],
          ['High score', bat.highScore],
          ['Bat avg', bat.average],
          ['Wickets', bowl.wickets],
          ['Best', bowl.best],
          ['Catches', career.catches],
        ]
      : []
  const paragraphs = player.bio
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)

  return (
    <main>
      <JsonLd data={playerJsonLd({ slug: player.slug, name: profile.name, photoUrl: player.photoUrl })} />
      <section className="relative overflow-hidden bg-brand-black text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-gold/15 blur-3xl"
        />
        <div className="container-site relative flex flex-col gap-8 py-12 sm:flex-row sm:items-end lg:py-16">
          <div className="h-40 w-40 shrink-0 overflow-hidden rounded-3xl bg-white/10 ring-1 ring-white/10 sm:h-48 sm:w-48">
            {player.photoUrl ? (
              <img src={player.photoUrl} alt={profile.name} className="h-full w-full object-cover" />
            ) : (
              <span aria-hidden className="display flex h-full w-full items-center justify-center text-6xl text-white/40">
                {initials(profile.name)}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <Link href="/players" className="text-sm text-white/60 hover:text-white">
              ← All players
            </Link>
            <p className="eyebrow mt-4 text-brand-gold">{profile.active ? 'Active player' : 'Past player'}</p>
            <h1 className="display mt-2 break-words text-4xl sm:text-5xl">{profile.name}</h1>
            {profile.yearsLabel && <p className="mt-3 text-white/75">{profile.yearsLabel}</p>}
            {profile.grades.length > 0 && <p className="mt-1 text-sm text-white/60">{profile.grades.join(' · ')}</p>}
          </div>
        </div>
      </section>

      <div className="container-site space-y-14 py-12 lg:py-16">
        {tiles.length > 0 && (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {tiles.map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-brand-black/5">
                <dt className="text-xs font-semibold uppercase tracking-wide text-brand-grey">{label}</dt>
                <dd className="display mt-1 text-3xl tabular-nums text-brand-black">{value}</dd>
              </div>
            ))}
          </dl>
        )}

        {(paragraphs.length > 0 || profile.honours.length > 0) && (
          <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
            {paragraphs.length > 0 && (
              <div>
                <h2 className="display mb-4 text-2xl text-brand-black">About</h2>
                <div className="space-y-4 leading-relaxed text-brand-charcoal">
                  {paragraphs.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              </div>
            )}
            {profile.honours.length > 0 && (
              <div>
                <h2 className="display mb-4 text-2xl text-brand-black">Honours &amp; roles</h2>
                <ul className="divide-y divide-brand-black/5 rounded-2xl bg-brand-gold-pale ring-1 ring-brand-gold/30">
                  {profile.honours.map((h) => (
                    <li key={h.id} className="flex gap-4 px-5 py-3">
                      <span className="w-24 shrink-0 font-semibold tabular-nums text-brand-gold-deep">{h.years}</span>
                      <span className="min-w-0 text-brand-black">{h.title}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {career && (
          <div>
            <h2 className="display mb-6 text-2xl text-brand-black">Season by season</h2>
            <PlayerSeasonTables seasons={profile.seasons} career={career} />
          </div>
        )}
      </div>
    </main>
  )
}
