/**
 * Social graphics: the shared vocabulary (wave C spec 3.1). Pure, no Next or Payload imports, so the specs, the layout maths and the
 * tests all run without a database. A graphic is `type x style x size`, composed from a handful of `Block`s by one renderer.
 */
export const SIZE_KEYS = ['square', 'story', 'landscape'] as const
export type SizeKey = (typeof SIZE_KEYS)[number]
/** Pixel sizes: square for feeds, portrait 9:16 for stories and reels covers, landscape for link previews, X and Facebook posts. */
export const SIZES: Record<SizeKey, { width: number; height: number; label: string }> = {
  square: { width: 1080, height: 1080, label: 'Square' },
  story: { width: 1080, height: 1920, label: 'Story' },
  landscape: { width: 1200, height: 630, label: 'Wide' },
}

export const STYLE_KEYS = ['bold', 'classic', 'minimal'] as const
export type StyleKey = (typeof STYLE_KEYS)[number]
export const STYLE_LABELS: Record<StyleKey, string> = { bold: 'Bold', classic: 'Classic', minimal: 'Minimal' }

export const TYPE_KEYS = ['result', 'fixtures', 'lineup', 'potm', 'milestone', 'stats-leaders', 'event-promo', 'sponsor-thanks', 'season-wrap', 'toss'] as const
export type GraphicType = (typeof TYPE_KEYS)[number]

export const isSizeKey = (v: unknown): v is SizeKey => typeof v === 'string' && (SIZE_KEYS as readonly string[]).includes(v)
export const isStyleKey = (v: unknown): v is StyleKey => typeof v === 'string' && (STYLE_KEYS as readonly string[]).includes(v)
export const isGraphicType = (v: unknown): v is GraphicType => typeof v === 'string' && (TYPE_KEYS as readonly string[]).includes(v)

/** One line of a list block. `lead` is a rank or order number, `value` the right-hand figure, `sub` a smaller second line. */
export type Row = { lead?: string; text: string; value?: string; /** A smaller note on the same line, after the text. */ sub?: string; /** A smaller second line under the text (taller row, counted by the density rules). */ detail?: string; badges?: string[] }

/** What a layout is made of. Text only: no markup ever comes from user input. */
export type Block =
  | { kind: 'kicker'; text: string }
  | { kind: 'headline'; text: string }
  | { kind: 'subhead'; text: string }
  | { kind: 'versus'; club: { name: string; score: string }; opp: { name: string; score: string }; note?: string }
  | { kind: 'bigNumber'; value: string; label?: string }
  | { kind: 'rows'; rows: Row[]; more: number; title?: string; /** Columns, filled top to bottom; 1 when omitted. */ columns?: number; /** Row height and text size multiplier (1 when omitted), set by a layout that has room to spare. */ scale?: number }
  | { kind: 'text'; text: string; muted?: boolean }
  /** A cover photo. Text is only ever drawn on the scrim below it, never on the photo itself. */
  | { kind: 'photo'; src: string | null; title: string; lines: string[] }
  | { kind: 'logos'; items: { src: string; name: string; tier?: string }[] }
  /** Names drawn as large text, for sponsors that have no logo we can draw. */
  | { kind: 'names'; items: { name: string; tier?: string }[] }

export type GraphicLayout = { blocks: Block[]; /** Shown instead of the blocks when there is nothing to draw. */ empty?: string; /** Leave the sponsor strip off (a graphic that already shows the sponsors). */ noStrip?: boolean }

/** Query-string style input, already decoded. */
export type RawParams = Record<string, string | undefined>

/** The pure half of a graphic: how its input is validated and how its data becomes blocks. Loading data is in `sources/`. */
export type GraphicSpec<P = unknown, D = unknown> = {
  type: GraphicType
  label: string
  /** One plain sentence for the tile in the composer. */
  hint: string
  /** Validate and normalise the input. Null means "no such graphic" (the route answers 404). */
  parse(raw: RawParams): P | null
  layout(data: D, style: StyleKey, size: SizeKey): GraphicLayout
  /** Values for the caption template placeholders. Missing or empty values drop their line. */
  captionVars(data: D): Record<string, string>
  /** A one-line description of the picture, for the preview alt text. */
  describe(data: D): string
}

/** A choice offered in the composer. Ids and labels only: no statistics. */
export type SourceChoice = { id: string; label: string; /** A short plain-English caution shown beside the choice (for example a sponsor whose logo cannot be drawn). */ note?: string; /** Other ways to draw the same choice (for a result: with or without the top performers). `id` is the default. */ variants?: { id: string; label: string }[] }
export type SourceList = { /** More than one may be picked (sponsors). */ multi?: boolean; choices: SourceChoice[]; /** Plain sentence shown when there is nothing to pick. */ empty: string }

export const FREE_TEXT_MAX = 80
/** Trim, drop control characters, cut at 80. Applied at parse time and again when the text is used. */
export function cleanText(v: unknown, max = FREE_TEXT_MAX): string {
  if (typeof v !== 'string') return ''
  return v.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim()
}

/** Ids in a query: lowercase letters, digits and dashes (slugs, game ids), or plain numbers. */
export const isSafeId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-z-]{1,64}$/.test(v)
/** A game id: PlayHQ ids, and imported games' `imp:` ids. Letters, digits, dash, underscore and colon only. */
export const isGameId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9:_-]{1,80}$/.test(v)
export const isNumericId = (v: unknown): v is string => typeof v === 'string' && /^[0-9]{1,12}$/.test(v)
export const isIsoDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`))
