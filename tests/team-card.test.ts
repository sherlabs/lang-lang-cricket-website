import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TeamCard } from '../components/teams/team-card'
import type { PublicTeam } from '../lib/teams-queries'

const team = (over: Partial<PublicTeam> = {}): PublicTeam => ({
  gameId: 'g1',
  gradeName: 'B Grade',
  roundName: 'Round 5',
  opponentName: 'Example Rovers',
  localDate: '2026-10-10',
  localTime: '13:00:00',
  venueName: 'Home Oval',
  venueSuburb: null,
  isHome: true,
  publishedAt: '2026-10-08T01:00:00.000Z',
  updated: false,
  showOrder: true,
  slots: [
    { order: 1, name: 'Sam Smith', slug: 'sam-smith', isCaptain: true, isKeeper: false, withheld: false, guest: false },
    { order: 2, name: 'Guest Person', slug: null, isCaptain: false, isKeeper: true, withheld: false, guest: true },
    { order: 3, name: 'Player name withheld', slug: null, isCaptain: false, isKeeper: false, withheld: true, guest: false },
  ],
  ...over,
})
const html = (t: PublicTeam) => renderToStaticMarkup(createElement(TeamCard, { team: t, locale: 'en-AU' }))

describe('TeamCard (the public team)', () => {
  it('shows the game, numbered names, tags and links only for real players', () => {
    const out = html(team())
    expect(out).toContain('Round 5 v Example Rovers')
    expect(out).toContain('<ol')
    expect(out).toContain('href="/players/sam-smith"')
    expect(out).toContain('Sam Smith')
    expect(out).toContain('>C<')
    expect(out).toContain('>WK<')
    expect(out).toContain('Player name withheld')
    expect(out.match(/href="\/players\//g)).toHaveLength(1)
    expect(out).not.toContain('Updated')
  })
  it('lists without numbers when the order is hidden, and says Updated after a republish', () => {
    const out = html(team({ showOrder: false, updated: true }))
    expect(out).toContain('<ul')
    expect(out).not.toContain('Batting position')
    expect(out).toContain('Updated')
  })
  it('escapes names (a guest name is text, never markup)', () => {
    const out = html(team({ slots: [{ order: 1, name: '<img src=x onerror=alert(1)>', slug: null, isCaptain: false, isKeeper: false, withheld: false, guest: true }] }))
    expect(out).not.toContain('<img')
    expect(out).toContain('&lt;img')
  })
})
