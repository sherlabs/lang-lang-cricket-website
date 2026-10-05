/* eslint-disable @next/next/no-img-element -- satori draws a plain <img>; next/image does not apply inside ImageResponse */
import type { ReactElement } from 'react'
import { WHITE, WHITE_75 } from '@/lib/theme/og'
import type { ResolvedTheme } from '@/lib/theme/resolve'
import type { PublicTeam } from '@/lib/teams-queries'
import { formatMatchDay, formatMatchTime, LINEUP_NAME_MAX } from './lineup-text'

/**
 * The lineup graphic (announce-teams spec 5.4): one size, 1200 x 630, so it works as the link preview Facebook shows. Colours come
 * only from the resolved theme (and the neutral white constants of `lib/theme/og.tsx`), fonts are the bundled `Display` and
 * `Body`, and the club name, crest, date and venue come from the team and the club settings: nothing club-specific is written here.
 */
export const LINEUP_IMAGE_SIZE = { width: 1200, height: 630 } as const

export function renderLineup(team: PublicTeam, ctx: { theme: ResolvedTheme; crestDataUri: string | null }, opts: { clubName: string; locale: string; siteHost: string }): ReactElement {
  const c = ctx.theme.colors
  const people = team.slots.length > 13 ? team.slots.slice(0, 13) : team.slots
  const rows = Math.ceil(people.length / 2) || 1
  const split = [people.slice(0, rows), people.slice(rows)]
  const size = rows > 6 ? 30 : 34
  const title = `${team.roundName ? `${team.roundName} ` : ''}v ${team.opponentName}`
  const when = [formatMatchDay(team.localDate, opts.locale), formatMatchTime(team.localTime), team.venueName].filter(Boolean).join('  |  ')
  const trim = (n: string) => (n.length > LINEUP_NAME_MAX ? `${n.slice(0, LINEUP_NAME_MAX - 1)}…` : n)
  const badge = (text: string) => (
    <div key={text} style={{ display: 'flex', marginLeft: 10, padding: '2px 10px', borderRadius: 999, fontSize: 20, background: c.gold, color: c.black }}>{text}</div>
  )
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontFamily: 'Body', background: c.black, color: WHITE, padding: '40px 56px', borderTop: `14px solid ${c.gold}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {ctx.crestDataUri && (
            <div style={{ display: 'flex', background: c.cream, padding: 8, borderRadius: 12, marginRight: 20 }}>
              <img src={ctx.crestDataUri} height={64} style={{ height: 64 }} alt="" />
            </div>
          )}
          <div style={{ display: 'flex', fontSize: 26, letterSpacing: 4, textTransform: 'uppercase', color: c['gold-light'] }}>{opts.clubName}</div>
        </div>
        {team.updated && <div style={{ display: 'flex', padding: '6px 18px', borderRadius: 999, fontSize: 22, letterSpacing: 3, background: c['gold-pale'], color: c['gold-deep'] }}>UPDATED</div>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 8 }}>
        <div style={{ display: 'flex', fontSize: 28, letterSpacing: 2, textTransform: 'uppercase', color: c.gold }}>{team.gradeName}</div>
        <div style={{ display: 'flex', fontSize: 56, lineHeight: 1.05, fontFamily: 'Display', color: WHITE, maxWidth: 1080, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{title}</div>
        <div style={{ display: 'flex', marginTop: 6, fontSize: 24, color: WHITE_75, maxWidth: 1080, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{when}</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
        {split.map((col, ci) => (
          <div key={ci} style={{ display: 'flex', flexDirection: 'column', width: '48%' }}>
            {col.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', height: size + 14, fontSize: size }}>
                {team.showOrder && <div style={{ display: 'flex', width: 52, fontFamily: 'Display', color: c['gold-light'] }}>{p.order}</div>}
                <div style={{ display: 'flex', maxWidth: 440, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', color: p.withheld ? WHITE_75 : WHITE }}>{trim(p.name)}</div>
                {p.isCaptain && badge('C')}
                {p.isKeeper && badge('WK')}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 22, color: WHITE_75, marginTop: 6 }}>{opts.siteHost}</div>
    </div>
  )
}
