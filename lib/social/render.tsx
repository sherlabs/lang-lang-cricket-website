/* eslint-disable @next/next/no-img-element -- satori draws a plain <img>; next/image does not apply inside ImageResponse */
import type { CSSProperties, ReactElement, ReactNode } from 'react'
import { WHITE } from '@/lib/theme/neutral'
import type { ResolvedTheme } from '@/lib/theme/resolve'
import { headlineSize, METRICS, type Metrics } from './density'
import { availableHeight, detailRowHeight, footerHeight, logosFor, photoHeight, type LogoGrid } from './fit'
import { STYLE_KITS, type StyleKit } from './kits'
import { rgba, styleTokens, type StyleTokens } from './style'
import { SIZES, type Block, type GraphicLayout, type Row, type SizeKey, type StyleKey } from './types'

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
  /** Sponsor logos already loaded as data URIs. */
  strip: { src: string; name: string }[]
}

type Ctx = { m: Metrics; t: StyleTokens; kit: StyleKit; size: SizeKey; theme: ResolvedTheme; grid: LogoGrid | null }

const col = (extra: CSSProperties = {}): CSSProperties => ({ display: 'flex', flexDirection: 'column', ...extra })
const row = (extra: CSSProperties = {}): CSSProperties => ({ display: 'flex', flexDirection: 'row', ...extra })
const ellipsis: CSSProperties = { overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }

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
  return (
    <div style={row({ alignItems: 'center', justifyContent: kit.align === 'center' ? 'center' : 'flex-start' })}>
      <Crest src={input.crestDataUri} c={c} tile={onBand || input.style === 'bold'} height={size} />
      <Text style={{ fontSize: m.club, letterSpacing: 4, textTransform: 'uppercase', color, fontWeight: 700, ...ellipsis }}>{input.clubName}</Text>
    </div>
  )
}

function RowLine({ r, c, compact }: { r: Row; c: Ctx; compact: boolean }) {
  const { m, t } = c
  const fs = compact ? Math.round(m.rowText * 0.9) : m.rowText
  // The main text takes what is left; the lead, badges and figure keep their size (flexShrink 0), so a long venue or grade never
  // pushes the name of the opponent out of the row.
  const fixed = { flexShrink: 0 } as const
  return (
    <div style={row({ alignItems: 'center', height: r.detail ? detailRowHeight(m) : m.row, borderBottom: `2px solid ${rgba(t.text, 0.16)}`, fontSize: fs })}>
      {r.lead !== undefined && <Text style={{ ...fixed, width: Math.round(fs * (r.lead.length > 2 ? 2.2 : 1.5)), fontFamily: 'Display', color: t.accentText }}>{r.lead}</Text>}
      <div style={col({ flex: 1, minWidth: 0, justifyContent: 'center' })}>
        <Text style={{ color: t.text, fontWeight: 700, ...ellipsis }}>{r.text}</Text>
        {r.detail && <Text style={{ fontSize: Math.round(fs * 0.72), color: t.textMuted, ...ellipsis }}>{r.detail}</Text>}
      </div>
      {r.sub && <Text style={{ ...fixed, marginLeft: 14, fontSize: Math.round(fs * 0.72), color: t.textMuted, maxWidth: '38%', ...ellipsis }}>{r.sub}</Text>}
      {(r.badges ?? []).map((bd) => (
        <Text key={bd} style={{ ...fixed, marginLeft: 8, padding: '2px 10px', borderRadius: 999, fontSize: Math.round(fs * 0.62), background: t.accent, color: t.onAccent }}>{bd}</Text>
      ))}
      {r.value && <Text style={{ ...fixed, marginLeft: 16, fontFamily: 'Display', color: t.text }}>{r.value}</Text>}
    </div>
  )
}

function Rows({ b, c }: { b: Extract<Block, { kind: 'rows' }>; c: Ctx }) {
  const { m, t } = c
  const cols = Math.max(1, b.columns ?? 1)
  const per = Math.ceil(b.rows.length / cols) || 1
  const groups = Array.from({ length: cols }, (_, i) => b.rows.slice(i * per, (i + 1) * per))
  return (
    <div style={col({ width: '100%' })}>
      {b.title && <Text style={{ fontSize: m.kicker, letterSpacing: 3, textTransform: 'uppercase', color: t.accentText, marginBottom: 8 }}>{b.title}</Text>}
      <div style={row({ width: '100%', justifyContent: 'space-between' })}>
        {groups.map((g, gi) => (
          <div key={gi} style={col({ width: cols === 1 ? '100%' : `${Math.floor(96 / cols)}%` })}>
            {g.map((r, i) => <RowLine key={i} r={r} c={c} compact={cols > 1} />)}
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
  return (
    <div style={{ position: 'relative', display: 'flex', width: '100%', height, background: t.surfaceAlt, overflow: 'hidden', borderRadius: 10 }}>
      {b.src && <img src={b.src} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} alt="" />}
      {/* Text never sits on the photo itself: it sits on a scrim whose colour was checked against the worst-case photo. */}
      <div style={col({ position: 'absolute', left: 0, right: 0, bottom: 0, padding: Math.round(m.pad / 2.5), background: rgba(s.color, s.alpha), color: s.text })}>
        <Text style={{ fontFamily: 'Display', fontSize: headlineSize(b.title, Math.round(m.headline * 0.75)), lineHeight: 1.05, maxHeight: Math.round(m.headline * 1.7), overflow: 'hidden' }}>{b.title}</Text>
        {b.lines.map((l, i) => (
          <Text key={i} style={{ fontSize: m.body, marginTop: 6, ...ellipsis }}>{l}</Text>
        ))}
      </div>
    </div>
  )
}

function renderBlock(b: Block, i: number, c: Ctx, last: boolean): ReactElement | null {
  const { m, t, kit } = c
  const center = kit.align === 'center'
  const wrap = col({ width: '100%', alignItems: center ? 'center' : 'flex-start', textAlign: center ? 'center' : 'left', marginTop: m.gap })
  switch (b.kind) {
    case 'kicker':
      return <Text key={i} style={{ marginTop: m.gap, fontSize: m.kicker, letterSpacing: 4, textTransform: 'uppercase', color: t.accentText, fontWeight: 700 }}>{b.text}</Text>
    case 'headline': {
      const text = kit.headlineUpper ? b.text.toUpperCase() : b.text
      return (
        <div key={i} style={{ ...wrap, marginTop: Math.round(m.gap / 2) }}>
          <Text style={{ fontFamily: 'Display', fontSize: headlineSize(text, m.headline), lineHeight: 1.05, color: t.text, maxHeight: Math.round(m.headline * 3.4), overflow: 'hidden' }}>{text}</Text>
          {kit.headlineRule && <div style={{ display: 'flex', width: 140, height: 8, marginTop: 16, background: t.accent }} />}
        </div>
      )
    }
    case 'subhead':
      return <Text key={i} style={{ marginTop: Math.round(m.gap / 2), fontSize: m.subhead, color: t.textMuted, maxHeight: m.subhead * 3.2, overflow: 'hidden' }}>{b.text}</Text>
    case 'text':
      return <Text key={i} style={{ marginTop: m.gap, fontSize: m.body, color: b.muted ? t.textMuted : t.text, maxHeight: m.body * 5, overflow: 'hidden' }}>{b.text}</Text>
    case 'versus':
      return (
        <div key={i} style={{ ...col({ width: '100%', marginTop: m.gap }) }}>
          {[b.club, b.opp].map((side, k) => (
            <div key={k} style={row({ alignItems: 'center', justifyContent: 'space-between', padding: `${Math.round(m.gap / 2)}px 0`, borderBottom: `2px solid ${rgba(t.text, 0.16)}` })}>
              <Text style={{ flex: 1, minWidth: 0, fontSize: m.subhead, fontWeight: 700, color: k === 0 ? t.text : t.textMuted, ...ellipsis }}>{side.name}</Text>
              <Text style={{ marginLeft: 20, fontFamily: 'Display', fontSize: m.score, lineHeight: 1, color: k === 0 ? t.accentText : t.text }}>{side.score}</Text>
            </div>
          ))}
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
      if (!g) return null
      const cellWidth = `${Math.floor(100 / g.columns)}%`
      return (
        <div key={i} style={row({ width: '100%', marginTop: m.gap, justifyContent: center ? 'center' : 'flex-start', flexWrap: 'wrap' })}>
          {b.items.map((l, k) => (
            <div key={k} style={col({ alignItems: center ? 'center' : 'flex-start', width: g.columns === 1 ? '100%' : cellWidth, paddingRight: g.columns === 1 ? 0 : 14, marginBottom: 14 })}>
              {/* A sponsor without a usable logo still gets a tile (its initial), so the grid stays even. */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: l.src ? WHITE : t.surfaceAlt, padding: 12, borderRadius: 14, height: g.logo + 24, minWidth: g.logo + 24 }}>
                {l.src ? (
                  <img src={l.src} height={g.logo} style={{ height: g.logo, maxWidth: g.columns === 1 ? 640 : Math.floor((SIZES[c.size].width - 2 * m.pad) / g.columns) - 60, objectFit: 'contain' }} alt="" />
                ) : (
                  <Text style={{ fontFamily: 'Display', fontSize: Math.round(g.logo * 0.6), color: t.accentText }}>{l.name.slice(0, 1).toUpperCase()}</Text>
                )}
              </div>
              {l.name && <Text style={{ marginTop: 6, fontSize: g.name, fontWeight: 700, color: t.text, maxWidth: '100%', ...ellipsis }}>{l.name}</Text>}
              {l.tier && <Text style={{ fontSize: g.tier, color: t.accentText }}>{l.tier}</Text>}
            </div>
          ))}
        </div>
      )
    }
  }
}

function Footer({ c, input }: { c: Ctx; input: RenderInput }) {
  const { m, t, kit } = c
  const center = kit.align === 'center'
  const hasText = Boolean(input.siteHost || input.attribution)
  const strip = input.layout.noStrip ? [] : input.strip
  if (!strip.length && !hasText) return null
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
          {input.attribution && <Text style={{ ...ellipsis }}>{input.attribution}</Text>}
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
  const available = availableHeight(input.size, input.style, footerHeight(input.size, { strip: !input.layout.noStrip && input.strip.length > 0, text: Boolean(input.siteHost || input.attribution) }))
  const c: Ctx = { m, t, kit, size: input.size, theme: input.theme, grid: logosFor(input.layout, input.size, input.style, available) }
  const blocks = input.layout.empty
    ? [<Text key="empty" style={{ marginTop: m.gap, fontSize: m.subhead, color: t.textMuted, justifyContent: center ? 'center' : 'flex-start' }}>{input.layout.empty}</Text>]
    : input.layout.blocks.map((b, i, all) => (
        // A block never shrinks: if the page is too full the bottom is cut, never two blocks drawn over each other.
        <div key={i} style={col({ width: '100%', flexShrink: 0, alignItems: center ? 'center' : 'flex-start' })}>{renderBlock(b, i, c, i === all.length - 1)}</div>
      ))
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
          {/* A story is tall: its content sits in the middle of the space instead of leaving a hole at the bottom. */}
          <div style={col({ width: '100%', flex: 1, minHeight: 0, justifyContent: input.size === 'story' ? 'center' : 'flex-start', alignItems: center ? 'center' : 'flex-start' })}>{blocks}</div>
        </div>
        <Footer c={c} input={input} />
      </div>
    </div>
  )
}
