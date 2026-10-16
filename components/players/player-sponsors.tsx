/* eslint-disable @next/next/no-img-element */
import Link from 'next/link'
import { Avatar } from '@/components/avatar'
import type { PlayerSponsorTile } from '@/lib/player-sponsors-queries'

/** Sponsor logo (or the name as text) linking out to the sponsor's site when it has one. */
function SponsorMark({ t, tall }: { t: PlayerSponsorTile; tall?: boolean }) {
  const mark = t.sponsorLogoUrl ? (
    <img src={t.sponsorLogoUrl} alt={t.sponsorName} loading="lazy" className={tall ? 'h-14 w-auto max-w-[10rem] object-contain' : 'h-10 w-auto max-w-[8rem] object-contain'} />
  ) : (
    <span className="text-sm font-semibold text-brand-black">{t.sponsorName}</span>
  )
  return t.sponsorLinkUrl ? (
    <a
      href={t.sponsorLinkUrl}
      target="_blank"
      rel="noopener noreferrer sponsored"
      className="inline-flex min-h-11 items-center rounded-md transition hover:opacity-80"
      aria-label={t.sponsorLogoUrl ? `${t.sponsorName} (opens their website)` : undefined}
    >
      {mark}
    </a>
  ) : (
    <span className="inline-flex min-h-11 items-center">{mark}</span>
  )
}

/** The prominent band on /players: each player beside the business that backs them. Renders nothing when empty. */
export function PlayerSponsorsBand({ tiles, heading = 'Player sponsors', intro }: { tiles: PlayerSponsorTile[]; heading?: string; intro?: string }) {
  if (tiles.length === 0) return null
  return (
    <section aria-labelledby="player-sponsors-heading" className="mb-14 overflow-hidden rounded-3xl bg-brand-black text-white">
      <div className="h-1 w-full bg-gradient-to-r from-brand-gold-dark via-brand-gold to-brand-gold-light" />
      <div className="p-6 sm:p-10">
        <p className="eyebrow text-brand-gold">Backing our players</p>
        <h2 id="player-sponsors-heading" className="display mt-2 text-3xl sm:text-4xl">{heading}</h2>
        {intro && <p className="mt-3 max-w-2xl text-white/75">{intro}</p>}
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((t) => (
            <li key={t.id} className="flex gap-4 rounded-2xl bg-white p-4 text-brand-black ring-1 ring-brand-gold/40">
              <Link href={`/players/${t.playerSlug}`} className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-brand-stone" aria-label={`${t.playerName}, player profile`}>
                <Avatar name={t.playerName} photoUrl={t.playerPhotoUrl} initialsClassName="text-3xl" />
              </Link>
              <div className="flex min-w-0 flex-1 flex-col">
                <Link href={`/players/${t.playerSlug}`} className="break-words font-heading text-lg font-bold leading-tight hover:text-brand-gold-deep">
                  {t.playerName}
                </Link>
                {t.season && <p className="text-xs font-semibold uppercase tracking-wide text-brand-gold-deep">{t.season}</p>}
                <p className="mt-1 text-xs text-brand-grey">Sponsored by</p>
                <SponsorMark t={t} />
                {t.message && <p className="mt-1 text-sm text-brand-grey">{t.message}</p>}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/** "Sponsored by" on the individual player page. Renders nothing when the player has no active sponsor. */
export function SponsoredBy({ tiles }: { tiles: PlayerSponsorTile[] }) {
  if (tiles.length === 0) return null
  return (
    <section aria-labelledby="sponsored-by-heading">
      <h2 id="sponsored-by-heading" className="display mb-4 text-2xl text-brand-black">Sponsored by</h2>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <li key={t.id} className="flex flex-col gap-2 rounded-2xl bg-white p-5 shadow-card ring-1 ring-brand-gold/40">
            <SponsorMark t={t} tall />
            {t.season && <p className="text-xs font-semibold uppercase tracking-wide text-brand-gold-deep">{t.season}</p>}
            {t.message && <p className="text-sm text-brand-grey">{t.message}</p>}
          </li>
        ))}
      </ul>
    </section>
  )
}
