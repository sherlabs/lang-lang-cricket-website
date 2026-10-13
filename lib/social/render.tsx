/* eslint-disable @next/next/no-img-element -- satori draws a plain <img>; next/image does not apply inside ImageResponse */
import type { CSSProperties, ReactElement, ReactNode } from 'react'
import { WHITE } from '@/lib/theme/neutral'
import type { ResolvedTheme } from '@/lib/theme/resolve'
import { METRICS, type Metrics } from './density'
import { availableHeight, contentWidth, detailRowHeight, footerHeight, headlineFit, LOGO_TILE_INSET, versusPad, logosFor, NAME_CELL_MAX, nameSize, nameTierSize, namesStacked, photoHeight, scaleMetrics, textFit, tierInline, type LogoGrid } from './fit'
import { STYLE_KITS, type StyleKit } from './kits'
import { rgba, styleTokens, type StyleTokens } from './style'
import { BODY_FACE, BODY_REGULAR, fitText, textWidth, type FaceKey, type FitResult } from './text-fit'
import { type Block, type GraphicLayout, type Row, type SizeKey, type StyleKey } from './types'

/**
 * The one renderer behind every graphic (wave C spec 3.1). A style is a `StyleKit`: token choices (in `style.ts`) plus three
 * structural switches. Type x style x size is composed from these primitives, not hand-written per cell. Everything is flex (satori),
 * text is always a text node, and colours come only from the style tokens.
 */

export type RenderInput = {
  layout: GraphicLayout
  style: StyleKey
  size: SizeKey
  theme: ResolvedTheme
  crestDataUri: string | null
  clubName: string
  /** Shown in the footer when set. */
  siteHost: string | null
  attribution: string
  /** Tests only: receives every fitted text and whether it had to be cut. */
  audit?: { text: string; size: number; lines: number; truncated: boolean }[]
  /** Sponsor logos already loaded as data URIs. */
  strip: { src: string; name: string }[]
}

type Ctx = { m: Metrics; t: StyleTokens; kit: StyleKit; size: SizeKey; theme: ResolvedTheme; grid: LogoGrid | null; /** The display face's width table key, for fitting text set in it. */ face: FaceKey; style: StyleKey; fit: typeof fitText; rec: (f: FitResult, text: string) => FitResult }

const col = (extra: CSSProperties = {}): CSSProperties => ({ display: 'flex', flexDirection: 'column', ...extra })
const row = (extra: CSSProperties = {}): CSSProperties => ({ display: 'flex', flexDirection: 'row', ...extra })

/**
 * Text that was fitted to its box by `fitText`: each line is its own node, so nothing depends on satori's wrapping and nothing is
 * clipped. (A cut with an ellipsis is the fitter's last resort and is already in the text.)
 */
function Fitted({ fit, style, align }: { fit: FitResult; style: CSSProperties; align?: 'center' | 'left' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: align === 'center' ? 'center' : 'flex-start', ...style, fontSize: fit.size }}>
      {fit.lines.map((l, i) => <div key={i} style={{ display: 'flex', whiteSpace: 'nowrap' }}>{l}</div>)}
    </div>
  )
}

function Text({ children, style }: { children: ReactNode; style: CSSProperties }) {
  return <div style={{ display: 'flex', ...style }}>{children}</div>
}

function Crest({ src, c, tile, height }: { src: string | null; c: Ctx; tile: boolean; height: number }) {
  if (!src) return null
  const img = <img src={src} height={height} style={{ height }} alt="" />
  // The crest may be dark, so on a coloured surface it sits on a tile of the theme's light surface.
  return tile ? <div style={{ display: 'flex', background: c.theme.colors.cream, padding: Math.round(height / 9), borderRadius: 12, marginRight: 18 }}>{img}</div> : <div style={{ display: 'flex', marginRight: 18 }}>{img}</div>
}

function Masthead({ c, input, where }: { c: Ctx; input: RenderInput; where: 'band' | 'plain' }) {
  const { m, t, kit } = c
  const onBand = where === 'band'
  const color = onBand ? t.bandText : t.accentText
  const size = kit.masthead === 'corner' ? Math.round(m.crest * 0.7) : m.crest
  const room = contentWidth(c.size) - (input.crestDataUri ? size + 40 : 0)
  const fit = c.fit(input.clubName.toUpperCase(), room, m.club, Math.round(m.club * 0.6), 1, BODY_FACE, 4)
  return (
    <div style={row({ alignItems: 'center', justifyContent: kit.align === 'center' ? 'center' : 'flex-start' })}>
      <Crest src={input.crestDataUri} c={c} tile={onBand || input.style === 'bold'} height={size} />
      <Fitted fit={fit} style={{ letterSpacing: 4, color, fontWeight: 700 }} />
    </div>
  )
}

function RowLine({ r, c, compact, width, rowH }: { r: Row; c: Ctx; compact: boolean; width: number; rowH: number }) {
  const { m, t } = c
  const fs = compact ? Math.round(m.rowText * 0.9) : m.rowText
  // The fixed parts (lead, badges, figure, side note) are measured first; the name gets what is left and is fitted to it: smaller
  // first, then two lines, never an ellipsis unless nothing fits at the minimum size.
  const fixed = { flexShrink: 0 } as const
  const leadW = r.lead !== undefined ? Math.round(fs * (r.lead.length > 2 ? 2.2 : 1.5)) : 0
  const valueW = r.value ? textWidth(r.value, fs, c.face) + 16 : 0
  const subPx = Math.round(fs * 0.72)
  const subFit = r.sub ? c.fit(r.sub, Math.round(width * 0.34), subPx, Math.round(subPx * 0.75), 1, BODY_REGULAR) : null
  const subW = subFit ? textWidth(subFit.lines[0], subFit.size, BODY_REGULAR) + 14 : 0
  const badgesW = (r.badges ?? []).reduce((n, b) => n + textWidth(b, Math.round(fs * 0.62), BODY_REGULAR) + 28, 0)
  const room = Math.max(80, width - leadW - valueW - subW - badgesW - 12)
  // A tall row can carry a third line of name before the text would have to shrink below about 55 percent of its size.
  const floorPx = Math.floor(fs * 0.55)
  const lines = r.detail ? 1 : rowH >= floorPx * 1.3 * 3 ? 3 : 2
  const minPx = Math.max(16, Math.min(floorPx, Math.floor((r.detail ? detailRowHeight(m) - Math.round(fs * 0.72 * 1.25) : rowH) / (lines * 1.3))))
  let name = fitText(r.text, room, fs, minPx, lines, BODY_FACE)
  // Still cut at two lines: a third line at a smaller size is better than losing words, when the row is tall enough to hold it.
  if (name.truncated && !r.detail) {
    const min3 = Math.max(16, Math.floor(rowH / (3 * 1.15)))
    const three = fitText(r.text, room, fs, Math.max(16, Math.min(min3, Math.round(minPx * 0.75))), 3, BODY_FACE)
    if (!three.truncated) name = three
  }
  name = c.rec(name, r.text)
  const detail = r.detail ? c.fit(r.detail, room, Math.round(fs * 0.72), Math.round(fs * 0.5), 1, BODY_REGULAR) : null
  return (
    <div style={row({ alignItems: 'center', height: r.detail ? detailRowHeight(m) : rowH, borderBottom: `2px solid ${rgba(t.text, 0.16)}`, fontSize: fs })}>
      {r.lead !== undefined && <Text style={{ ...fixed, width: leadW, fontFamily: 'Display', color: t.accentText }}>{r.lead}</Text>}
      <div style={col({ flex: 1, minWidth: 0, justifyContent: 'center' })}>
        <Fitted fit={name} style={{ color: t.text, fontWeight: 700, lineHeight: 1.1 }} />
        {detail && <Fitted fit={detail} style={{ color: t.textMuted }} />}
      </div>
      {subFit && <Fitted fit={subFit} style={{ ...fixed, marginLeft: 14, color: t.textMuted }} />}
      {(r.badges ?? []).map((bd) => (
        <Text key={bd} style={{ ...fixed, marginLeft: 8, padding: '2px 10px', borderRadius: 999, fontSize: Math.round(fs * 0.62), background: t.accent, color: t.onAccent }}>{bd}</Text>
      ))}
      {r.value && <Text style={{ ...fixed, marginLeft: 16, fontFamily: 'Display', color: t.text }}>{r.value}</Text>}
    </div>
  )
}

function Rows({ b, c: base }: { b: Extract<Block, { kind: 'rows' }>; c: Ctx }) {
  // A list with room to spare is drawn larger (see `fillRowsScale`); every row, and the "+ N more" line, use the scaled metrics.
  const c: Ctx = b.scale ? { ...base, m: scaleMetrics(base.m, b.scale) } : base
  const { m, t } = c
  const cols = Math.max(1, b.columns ?? 1)
  const per = Math.ceil(b.rows.length / cols) || 1
  const groups = Array.from({ length: cols }, (_, i) => b.rows.slice(i * per, (i + 1) * per))
  const colWidth = cols === 1 ? contentWidth(c.size) : Math.floor((contentWidth(c.size) * 0.96) / cols)
  return (
    <div style={col({ width: '100%' })}>
      {b.title && <Text style={{ fontSize: m.kicker, letterSpacing: 3, textTransform: 'uppercase', color: t.accentText, marginBottom: 8 }}>{b.title}</Text>}
      <div style={row({ width: '100%', justifyContent: 'space-between' })}>
        {groups.map((g, gi) => (
          <div key={gi} style={col({ width: cols === 1 ? '100%' : `${Math.floor(96 / cols)}%` })}>
            {g.map((r, i) => <RowLine key={i} r={r} c={c} compact={cols > 1} width={colWidth} rowH={m.row} />)}
          </div>
        ))}
      </div>
      {b.more > 0 && <Text style={{ height: m.row, alignItems: 'center', fontSize: Math.round(m.rowText * 0.8), color: t.textMuted }}>{`+ ${b.more} more`}</Text>}
    </div>
  )
}

function Photo({ b, c, last }: { b: Extract<Block, { kind: 'photo' }>; c: Ctx; last: boolean }) {
  const { m, t, size } = c
  // A photo that is the whole story gets the room; one that shares the page with a list stays shorter.
  const height = photoHeight(size, last)
  const s = t.scrim
  const pad = Math.round(m.pad / 2.5)
  const title = c.fit(b.title, contentWidth(size) - 2 * pad, Math.round(m.headline * 0.75), Math.round(m.headline * 0.36), 2, c.face)
  return (
    <div style={{ position: 'relative', display: 'flex', width: '100%', height, background: t.surfaceAlt, overflow: 'hidden', borderRadius: 10 }}>
      {b.src && <img src={b.src} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} alt="" />}
      {/* Text never sits on the photo itself: it sits on a scrim whose colour was checked against the worst-case photo. */}
      <div style={col({ position: 'absolute', left: 0, right: 0, bottom: 0, padding: pad, background: rgba(s.color, s.alpha), color: s.text })}>
        <Fitted fit={title} style={{ fontFamily: 'Display', lineHeight: 1.05 }} />
        {b.lines.map((l, i) => (
          <Fitted key={i} fit={c.fit(l, contentWidth(size) - 2 * pad, m.body, Math.round(m.body * 0.7), 1, BODY_REGULAR)} style={{ marginTop: 6 }} />
        ))}
      </div>
    </div>
  )
}

/** A logo tile: the logo `contain`ed on paper, the sponsor's name fitted underneath, then the level. */
function LogoCell({ l, g, c, hero }: { l: { src: string; name: string; tier?: string }; g: LogoGrid; c: Ctx; hero: boolean }) {
  const { t } = c
  const inner = { w: g.tileW - 2 * LOGO_TILE_INSET, h: g.tileH - 2 * LOGO_TILE_INSET }
  const name = l.name ? c.fit(l.name, g.cellW, g.name, Math.round(g.name * 0.7), 2, BODY_FACE) : null
  return (
    <div style={col({ alignItems: 'center', width: g.cellW })}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: WHITE, width: g.tileW, height: g.tileH, borderRadius: hero ? 24 : 18, border: `2px solid ${rgba(t.text, 0.18)}` }}>
        <img src={l.src} width={inner.w} height={inner.h} style={{ width: inner.w, height: inner.h, objectFit: 'contain' }} alt="" />
      </div>
      {name && <Fitted fit={name} align="center" style={{ marginTop: 6, fontWeight: 700, color: t.text, textAlign: 'center' }} />}
      {l.tier && <Text style={{ fontSize: g.tier, color: t.accentText }}>{l.tier}</Text>}
    </div>
  )
}

function renderBlock(b: Block, i: number, c: Ctx, last: boolean, input: RenderInput): ReactElement | null {
  const { m, t, kit } = c
  const center = kit.align === 'center'
  const width = contentWidth(c.size)
  const wrap = col({ width: '100%', alignItems: center ? 'center' : 'flex-start', textAlign: center ? 'center' : 'left', marginTop: m.gap })
  switch (b.kind) {
    case 'kicker':
      return <Text key={i} style={{ marginTop: m.gap, fontSize: m.kicker, letterSpacing: 4, textTransform: 'uppercase', color: t.accentText, fontWeight: 700 }}>{b.text}</Text>
    case 'headline': {
      const fit = c.rec(headlineFit(b.text, c.size, c.style, c.face), b.text)
      return (
        <div key={i} style={{ ...wrap, marginTop: Math.round(m.gap / 2) }}>
          <Fitted fit={fit} align={center ? 'center' : 'left'} style={{ fontFamily: 'Display', lineHeight: 1.05, color: t.text }} />
          {kit.headlineRule && <div style={{ display: 'flex', width: 140, height: 8, marginTop: 16, background: t.accent }} />}
        </div>
      )
    }
    case 'subhead':
      return <Fitted key={i} fit={c.rec(textFit(b.text, c.size, m.subhead, 2), b.text)} align={center ? 'center' : 'left'} style={{ marginTop: Math.round(m.gap / 2), color: t.textMuted }} />
    case 'text':
      return <Fitted key={i} fit={c.rec(textFit(b.text, c.size, m.body, 3), b.text)} align={center ? 'center' : 'left'} style={{ marginTop: m.gap, color: b.muted ? t.textMuted : t.text }} />
    case 'versus':
      return (
        <div key={i} style={{ ...col({ width: '100%', marginTop: m.gap }) }}>
          {[b.club, b.opp].map((side, k) => {
            const score = c.fit(side.score, Math.round(width * 0.5), m.score, Math.round(m.score * 0.5), 1, c.face)
            const name = c.fit(side.name, width - textWidth(side.score, score.size, c.face) - 32, m.subhead, Math.round(m.subhead * 0.6), 2, BODY_FACE)
            return (
              <div key={k} style={row({ alignItems: 'center', justifyContent: 'space-between', padding: `${versusPad(m, c.size)}px 0`, borderBottom: `2px solid ${rgba(t.text, 0.16)}` })}>
                <Fitted fit={name} style={{ flex: 1, minWidth: 0, fontWeight: 700, color: k === 0 ? t.text : t.textMuted }} />
                <Fitted fit={score} style={{ marginLeft: 20, fontFamily: 'Display', lineHeight: 1, color: k === 0 ? t.accentText : t.text, flexShrink: 0 }} />
              </div>
            )
          })}
          {b.note && <Text style={{ marginTop: Math.round(m.gap / 2), fontSize: m.subhead, color: t.textMuted }}>{b.note}</Text>}
        </div>
      )
    case 'bigNumber':
      return (
        <div key={i} style={wrap}>
          <Text style={{ fontFamily: 'Display', fontSize: m.bigNumber, lineHeight: 1, color: t.accentText }}>{b.value}</Text>
          {b.label && <Text style={{ fontSize: m.subhead, color: t.text }}>{b.label}</Text>}
        </div>
      )
    case 'rows':
      return (
        <div key={i} style={{ ...col({ width: '100%', marginTop: m.gap }) }}>
          <Rows b={b} c={c} />
        </div>
      )
    case 'photo':
      return (
        <div key={i} style={{ ...col({ width: '100%', marginTop: m.gap }) }}>
          <Photo b={b} c={c} last={last} />
        </div>
      )
    case 'logos': {
      const g = c.grid
      if (!g || !b.items.length) return null
      let at = 0
      return (
        <div key={i} style={col({ width: '100%', marginTop: m.gap, alignItems: 'center' })}>
          {g.rows.map((n, ri) => {
            const cells = b.items.slice(at, at + n)
            at += n
            return (
              <div key={ri} style={row({ justifyContent: 'center', marginTop: ri ? g.gap : 0 })}>
                {cells.map((l, k) => <div key={k} style={{ display: 'flex', marginLeft: k ? g.gap : 0 }}><LogoCell l={l} g={g} c={c} hero={b.items.length === 1} /></div>)}
              </div>
            )
          })}
        </div>
      )
    }
    case 'names': {
      // Sponsors without a logo we can draw: the name itself is the picture. One per line for three or fewer, a wrapped line otherwise.
      const stacked = namesStacked(b.items.length)
      const boxW = stacked ? width : Math.floor(width * NAME_CELL_MAX)
      return (
        <div key={i} style={row({ width: '100%', marginTop: m.gap, ...(stacked ? { flexDirection: 'column', alignItems: center ? 'center' : 'flex-start' } : { flexWrap: 'wrap', justifyContent: center ? 'center' : 'flex-start', alignItems: 'flex-start' }) })}>
          {b.items.map((n, k) => {
            const inline = Boolean(n.tier) && tierInline(c.size)
            const tierW = inline ? textWidth(`${n.tier}  `, nameTierSize(c.size), BODY_REGULAR) + 12 : 0
            const fit = c.fit(n.name, boxW - tierW, nameSize(c.size), Math.round(nameSize(c.size) * 0.55), 2, c.face)
            return (
              <div key={k} style={col({ alignItems: center ? 'center' : 'flex-start', maxWidth: stacked ? '100%' : `${NAME_CELL_MAX * 100}%`, marginRight: stacked ? 0 : 28, marginBottom: 8 })}>
                <div style={row({ alignItems: 'baseline', maxWidth: '100%' })}>
                  <Fitted fit={fit} style={{ fontFamily: 'Display', lineHeight: 1.2, color: t.text, minWidth: 0 }} />
                  {inline && <Text style={{ flexShrink: 0, marginLeft: 12, fontSize: nameTierSize(c.size), color: t.accentText }}>{n.tier}</Text>}
                </div>
                {n.tier && !inline && <Text style={{ fontSize: nameTierSize(c.size), color: t.accentText }}>{n.tier}</Text>}
              </div>
            )
          })}
        </div>
      )
    }
  }
  void input
}

function Footer({ c, input }: { c: Ctx; input: RenderInput }) {
  const { m, t, kit } = c
  const center = kit.align === 'center'
  const hasText = Boolean(input.siteHost || input.attribution)
  const strip = input.layout.noStrip ? [] : input.strip
  if (!strip.length && !hasText) return null
  const hostW = input.siteHost ? textWidth(input.siteHost, m.footer, BODY_REGULAR) + 18 : 0
  const attribution = input.attribution ? c.fit(input.attribution, contentWidth(c.size) - hostW, m.footer, Math.round(m.footer * 0.7), 1, BODY_REGULAR) : null
  return (
    <div style={col({ width: '100%', marginTop: m.gap, alignItems: center ? 'center' : 'flex-start' })}>
      {strip.length > 0 && (
        <div style={row({ alignItems: 'center', justifyContent: center ? 'center' : 'flex-start', flexWrap: 'nowrap', overflow: 'hidden', width: '100%' })}>
          {strip.map((l, i) => (
            <div key={i} style={{ display: 'flex', background: WHITE, padding: 8, borderRadius: 10, marginRight: 14 }}>
              <img src={l.src} height={m.logo} style={{ height: m.logo }} alt="" />
            </div>
          ))}
        </div>
      )}
      {hasText && (
        <div style={row({ marginTop: strip.length ? 10 : 0, fontSize: m.footer, color: t.textMuted, justifyContent: center ? 'center' : 'flex-start' })}>
          {input.siteHost && <Text style={{ marginRight: input.attribution ? 18 : 0 }}>{input.siteHost}</Text>}
          {attribution && <Fitted fit={attribution} style={{}} />}
        </div>
      )}
    </div>
  )
}

/** Draw one graphic. Pure: all data (fonts aside) arrives in `input`, so it renders the same in a route and in a test. */
export function renderGraphic(input: RenderInput): ReactElement {
  const m = METRICS[input.size]
  const kit = STYLE_KITS[input.style]
  const t = styleTokens(input.theme, input.style)
  const center = kit.align === 'center'
  const face: FaceKey = input.theme.font.key
  const available = availableHeight(input.size, input.style, footerHeight(input.size, { strip: !input.layout.noStrip && input.strip.length > 0, text: Boolean(input.siteHost || input.attribution) }))
  const rec = (f: FitResult, text: string): FitResult => { input.audit?.push({ text, size: f.size, lines: f.lines.length, truncated: f.truncated }); return f }
  const c: Ctx = { m, t, kit, size: input.size, theme: input.theme, grid: logosFor(input.layout, input.size, input.style, available), face, style: input.style, fit: (text, ...rest) => rec(fitText(text, ...rest), text), rec }
  // The kicker, headline and subhead stay at the top; everything else is centred in the space between them and the footer, so a
  // short list or a few logos never leave a hole at the bottom of the picture.
  const all = input.layout.blocks
  const lead = (() => { let n = 0; while (n < all.length && ['kicker', 'headline', 'subhead'].includes(all[n].kind)) n++; return n })()
  const node = (b: Block, i: number) => (
    // A block never shrinks: if the page is too full the bottom is cut, never two blocks drawn over each other.
    <div key={i} style={col({ width: '100%', flexShrink: 0, alignItems: center ? 'center' : 'flex-start' })}>{renderBlock(b, i, c, i === all.length - 1, input)}</div>
  )
  const empty = input.layout.empty ? <Text key="empty" style={{ marginTop: m.gap, fontSize: m.subhead, color: t.textMuted, justifyContent: center ? 'center' : 'flex-start' }}>{input.layout.empty}</Text> : null
  return (
    <div style={col({ width: '100%', height: '100%', fontFamily: 'Body', background: t.surface, color: t.text, ...(kit.frame === 'bar' ? { borderTop: `14px solid ${t.accent}` } : {}) })}>
      {kit.frame === 'band' && (
        <div style={col({ background: t.band, padding: `${Math.round(m.pad / 2.4)}px ${m.pad}px`, borderBottom: `8px solid ${t.accent}` })}>
          <Masthead c={c} input={input} where="band" />
        </div>
      )}
      <div style={col({ flex: 1, minHeight: 0, padding: `${Math.round(m.pad * (kit.frame === 'band' ? 0.5 : 0.7))}px ${m.pad}px ${Math.round(m.pad * 0.7)}px`, justifyContent: 'space-between', overflow: 'hidden' })}>
        <div style={col({ width: '100%', flex: 1, minHeight: 0, alignItems: center ? 'center' : 'flex-start', overflow: 'hidden' })}>
          {kit.frame !== 'band' && <Masthead c={c} input={input} where="plain" />}
          {/* An array, not a fragment: satori draws a fragment as a row. */}
          {empty ?? [
            ...all.slice(0, lead).map((b, i) => node(b, i)),
            <div key="body" style={col({ width: '100%', flex: 1, minHeight: 0, justifyContent: 'center', alignItems: center ? 'center' : 'flex-start' })}>{all.slice(lead).map((b, i) => node(b, i + lead))}</div>,
          ]}
        </div>
        <Footer c={c} input={input} />
      </div>
    </div>
  )
}
