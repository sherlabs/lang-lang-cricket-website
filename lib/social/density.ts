import type { Row, SizeKey } from './types'

/**
 * Density rules shared by every graphic (wave C spec 3.1). A size decides type scale and how many list rows fit; a list longer than
 * that is cut at a whole row with "+ N more", never clipped mid-row. Story is tall, so it gets larger type and more rows; landscape
 * is short, so it gets fewer rows.
 */
export type Metrics = {
  pad: number
  crest: number
  club: number
  kicker: number
  headline: number
  subhead: number
  body: number
  row: number
  rowText: number
  bigNumber: number
  score: number
  logo: number
  footer: number
  /** List rows that fit under a headline. */
  maxRows: number
  /** Characters of a row name before it is cut. */
  nameMax: number
  gap: number
}

export const METRICS: Record<SizeKey, Metrics> = {
  square: { pad: 72, crest: 84, club: 28, kicker: 30, headline: 92, subhead: 38, body: 36, row: 66, rowText: 38, bigNumber: 260, score: 120, logo: 84, footer: 24, maxRows: 7, nameMax: 26, gap: 22 },
  story: { pad: 80, crest: 100, club: 32, kicker: 34, headline: 112, subhead: 44, body: 42, row: 100, rowText: 50, bigNumber: 340, score: 150, logo: 100, footer: 28, maxRows: 11, nameMax: 26, gap: 30 },
  landscape: { pad: 44, crest: 56, club: 22, kicker: 22, headline: 54, subhead: 26, body: 24, row: 40, rowText: 26, bigNumber: 120, score: 76, logo: 52, footer: 18, maxRows: 5, nameMax: 30, gap: 12 },
}

/** Shorten to `max` characters with an ellipsis. */
export function clip(text: string, max: number): string {
  const t = text.trim()
  return t.length > max ? `${t.slice(0, Math.max(1, max - 1)).trimEnd()}…` : t
}

/** Font size for a headline: shrinks stepwise as the text gets longer so it stays inside a few lines. */
export function headlineSize(text: string, base: number): number {
  const n = text.length
  if (n <= 18) return base
  if (n <= 30) return Math.round(base * 0.82)
  if (n <= 48) return Math.round(base * 0.66)
  return Math.round(base * 0.52)
}

/** Cut a list to what the size fits. `reserve` takes rows away for other content on the page. */
export function cutRows(rows: readonly Row[], size: SizeKey, reserve = 0, columns = 1): { rows: Row[]; more: number } {
  const fit = Math.max(1, (METRICS[size].maxRows - reserve) * columns)
  if (rows.length <= fit) return { rows: [...rows], more: 0 }
  // Keep a row for the "+ N more" line, so the list stays inside the space.
  const keep = Math.max(1, fit - 1)
  return { rows: rows.slice(0, keep), more: rows.length - keep }
}

/** Row names are cut by character budget (satori cannot measure text), per size. */
export const rowName = (name: string, size: SizeKey): string => clip(name, METRICS[size].nameMax)
