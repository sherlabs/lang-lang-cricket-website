import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TrendChart } from '@/components/stats/trend-chart'

describe('TrendChart value labels', () => {
  it('prints 149 and 150 at different heights', () => {
    const html = renderToStaticMarkup(createElement(TrendChart, {
      idPrefix: 't', title: 'Average team total', takeaway: 'x', legend: 'y', tableHead: ['Season', 'For'], tableRows: [['2025/26', '149']],
      input: { labels: ['2025/26'], bars: [{ value: 149, text: '149' }], line: [150] },
    }))
    const ys = [...html.matchAll(/<text x="[\d.]+" y="([\d.]+)"[^>]*>(149|150)<\/text>/g)].map((m) => ({ y: m[1], t: m[2] }))
    expect(ys.map((v) => v.t).sort()).toEqual(['149', '150'])
    expect(ys[0].y).not.toBe(ys[1].y)
  })
})
