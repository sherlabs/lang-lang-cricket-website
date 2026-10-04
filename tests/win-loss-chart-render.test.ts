import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { WinLossChart, winLossDescription } from '@/components/stats/win-loss-chart'
import type { GradeProgression } from '@/lib/stats/match/yearbook'

const prog: GradeProgression = {
  grade: 'A Grade',
  cells: [
    { gameId: '1', date: '2025-10-11', opponent: 'Rivals', letter: 'W', word: 'Won', forfeit: false, wins: 1, losses: 0, net: 1 },
    { gameId: '2', date: '2025-10-18', opponent: 'Others', letter: 'L', word: 'Lost', forfeit: false, wins: 1, losses: 1, net: 0 },
    { gameId: '3', date: '2025-10-25', opponent: 'Rivals', letter: 'W', word: 'Won by forfeit', forfeit: true, wins: 2, losses: 1, net: 1 },
    { gameId: '4', date: '2025-11-01', opponent: 'Others', letter: 'D', word: 'Drawn', forfeit: false, wins: 2, losses: 1, net: 1 },
  ],
}
const html = renderToStaticMarkup(createElement(WinLossChart, { progression: prog, idPrefix: 't' }))

describe('WinLossChart', () => {
  it('is an accessible SVG with a title, a description and an adjacent table', () => {
    expect(html).toContain('role="img"')
    expect(html).toMatch(/<title id="t-t">A Grade: win and loss progression<\/title>/)
    expect(html).toContain('<desc id="t-d">')
    expect(html).toContain('<details')
    expect(html).toContain('<caption class="sr-only">')
    expect(html).toContain('Wins minus losses')
  })
  it('shows a letter for every game so colour is never the only cue, and marks the forfeit', () => {
    for (const l of ['W', 'L', 'D']) expect(html).toContain(`>${l}</text>`)
    expect(html.match(/>W<\/text>/g)).toHaveLength(2)
    expect(html).toContain('>f</text>')
  })
  it('draws the stepped line and uses brand classes only (no hex, no inline colours)', () => {
    expect(html).toContain('<path d="M ')
    expect(html).toContain('stroke-brand-gold-deep')
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}\b/)
    expect(html).not.toMatch(/style="[^"]*(color|fill|stroke)/)
  })
  it('describes each game in words and renders nothing for an empty series', () => {
    expect(winLossDescription(prog)).toContain('Game 3 on 25 Oct 2025 against Rivals: Won by forfeit.')
    expect(renderToStaticMarkup(createElement(WinLossChart, { progression: { grade: 'x', cells: [] }, idPrefix: 'e' }))).toBe('')
  })
})
