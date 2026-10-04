/**
 * Duplicate-player suggestions (W2 spec 6.2, issue #10). Pure: no database, no Next imports.
 *
 * Blocking, not all pairs: two players are only compared when they share a block key (the normalised last
 * name, its Soundex code, or the same two names in either order), which keeps a 1,500-player club to a few
 * thousand comparisons. Within a block a pair scores 0 to 100: name similarity (weight 0.6) plus how much their
 * seasons overlap (weight 0.4). Two players who appeared in the same game cannot be one person and are never
 * suggested; a pair an admin dismissed stays dismissed.
 */

export type DupSeason = { seasonStartYear: number | null; teamKey: string; grade: string | null }
export type DupPlayer = { id: number; firstName: string; lastName: string; hidden: boolean; games: number; seasons: DupSeason[] }
export type Suggestion = { a: DupPlayer; b: DupPlayer; score: number; nameScore: number; overlapScore: number; sameName: boolean; reasons: string[] }

export const MIN_SUGGESTION_SCORE = 60
export const MAX_SUGGESTIONS = 50
const NAME_WEIGHT = 0.6
const OVERLAP_WEIGHT = 0.4

/** Lower-case letters only, accents folded ("Jóhn O'Brien" gives "johnobrien"). */
export const fold = (s: string): string =>
  (s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '')

export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1
  if (!a.length || !b.length) return 0
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1)
  const aMatch = new Array<boolean>(a.length).fill(false)
  const bMatch = new Array<boolean>(b.length).fill(false)
  let matches = 0
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - range); j < Math.min(b.length, i + range + 1); j++) {
      if (bMatch[j] || a[i] !== b[j]) continue
      aMatch[i] = bMatch[j] = true
      matches++
      break
    }
  }
  if (!matches) return 0
  let t = 0, k = 0
  for (let i = 0; i < a.length; i++) {
    if (!aMatch[i]) continue
    while (!bMatch[k]) k++
    if (a[i] !== b[k]) t++
    k++
  }
  const jaro = (matches / a.length + matches / b.length + (matches - t / 2) / matches) / 3
  let prefix = 0
  while (prefix < 4 && prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++
  return jaro + prefix * 0.1 * (1 - jaro)
}

/** True when the strings differ by at most one insertion, deletion or substitution (and are not equal). */
export function editDistanceOne(a: string, b: string): boolean {
  if (a === b || Math.abs(a.length - b.length) > 1) return false
  if (a.length === b.length) {
    let diff = 0
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++diff > 1) return false
    return diff === 1
  }
  const [s, l] = a.length < b.length ? [a, b] : [b, a]
  let i = 0
  while (i < s.length && s[i] === l[i]) i++
  return s.slice(i) === l.slice(i + 1)
}

export function soundex(raw: string): string {
  const s = fold(raw)
  if (!s) return ''
  const code: Record<string, string> = { b: '1', f: '1', p: '1', v: '1', c: '2', g: '2', j: '2', k: '2', q: '2', s: '2', x: '2', z: '2', d: '3', t: '3', l: '4', m: '5', n: '5', r: '6' }
  let out = s[0].toUpperCase()
  let prev = code[s[0]] ?? ''
  for (let i = 1; i < s.length && out.length < 4; i++) {
    const c = code[s[i]] ?? ''
    if (c && c !== prev) out += c
    if (s[i] !== 'h' && s[i] !== 'w') prev = c
  }
  return out.padEnd(4, '0')
}

type Names = { firstName: string; lastName: string }

/** Block keys: players are compared only when they share one. */
export function blockKeys(p: Names): string[] {
  const first = fold(p.firstName), last = fold(p.lastName)
  const keys = new Set<string>()
  if (last) {
    keys.add(`last:${last}`)
    keys.add(`sx:${soundex(last)}`)
  }
  if (first && last) keys.add(`pair:${[first, last].sort().join('|')}`)
  // A one-word name has no last name: the whole name is the key.
  if (first && !last) keys.add(`last:${first}`)
  return [...keys]
}

/** Name similarity on the `first|last` key, 0 to 100, and the plain-English reason for it. */
export function nameSimilarity(x: Names, y: Names): { score: number; reason: string } {
  const f1 = fold(x.firstName), l1 = fold(x.lastName), f2 = fold(y.firstName), l2 = fold(y.lastName)
  if (!f1 && !l1) return { score: 0, reason: '' }
  if (f1 === f2 && l1 === l2) return { score: 100, reason: 'Same name' }
  if (f1 === l2 && l1 === f2) return { score: 92, reason: 'First and last name the other way round' }
  if (l1 && l1 === l2 && f1 && f2 && (f1.length === 1 || f2.length === 1) && f1[0] === f2[0]) return { score: 88, reason: 'Initial instead of the first name' }
  if (l1 === l2 && editDistanceOne(f1, f2)) return { score: 85, reason: 'First names differ by one letter' }
  if (f1 === f2 && editDistanceOne(l1, l2)) return { score: 85, reason: 'Last names differ by one letter' }
  const jw = jaroWinkler(`${f1} ${l1}`, `${f2} ${l2}`)
  return { score: Math.min(84, Math.round(jw * 100)), reason: 'Similar spelling' }
}

/** How much two players' seasons overlap, 0 to 100, with a penalty flag when they played the same grade in the same season for different teams. */
export function seasonOverlap(a: DupPlayer, b: DupPlayer): { score: number; reasons: string[]; concurrentConflict: boolean } {
  const reasons: string[] = []
  let score = 0
  let conflict = false
  for (const x of a.seasons) {
    for (const y of b.seasons) {
      if (x.seasonStartYear === null || y.seasonStartYear === null) continue
      const gap = Math.abs(x.seasonStartYear - y.seasonStartYear)
      if (gap === 0 && x.grade && x.grade === y.grade && x.teamKey !== y.teamKey) conflict = true
      if (gap > 1) continue
      if (x.teamKey === y.teamKey) {
        if (score < 100) reasons.push(gap === 0 ? 'Played for the same team in the same season' : 'Played for the same team in neighbouring seasons')
        score = 100
      } else if (x.grade && x.grade === y.grade) score = Math.max(score, 60)
    }
  }
  return { score, reasons: [...new Set(reasons)].slice(0, 1), concurrentConflict: conflict }
}

export const pairKey = (a: number, b: number): string => (a < b ? `${a}|${b}` : `${b}|${a}`)

export type SuggestOptions = {
  /** Pairs that played in the same game (never suggested). */
  sameGame?: ReadonlySet<string>
  /** Pairs an admin said are different people. */
  dismissed?: ReadonlySet<string>
  limit?: number
  min?: number
}

/** The ranked likely-duplicate list. Hidden players are included (the view is admin only). */
export function suggestDuplicates(players: readonly DupPlayer[], opts: SuggestOptions = {}): Suggestion[] {
  const blocks = new Map<string, DupPlayer[]>()
  for (const p of players) for (const k of blockKeys(p)) blocks.set(k, [...(blocks.get(k) ?? []), p])
  const seen = new Set<string>()
  const out: Suggestion[] = []
  const min = opts.min ?? MIN_SUGGESTION_SCORE
  for (const members of blocks.values()) {
    if (members.length < 2) continue
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const a = members[i], b = members[j]
        const key = pairKey(a.id, b.id)
        if (seen.has(key)) continue
        seen.add(key)
        if (opts.sameGame?.has(key) || opts.dismissed?.has(key)) continue
        const name = nameSimilarity(a, b)
        const overlap = seasonOverlap(a, b)
        let score = Math.round(NAME_WEIGHT * name.score + OVERLAP_WEIGHT * overlap.score)
        if (overlap.concurrentConflict) score -= 40
        // A same-name pair is a duplicate candidate however little they overlap.
        const sameName = name.score === 100
        if (sameName) score = Math.max(score, 60)
        if (score < min) continue
        out.push({ a, b, score, nameScore: name.score, overlapScore: overlap.score, sameName, reasons: [name.reason, ...overlap.reasons].filter(Boolean) })
      }
    }
  }
  // Same-name pairs that never co-appear first, then by score; ids make the order stable.
  out.sort((x, y) => Number(y.sameName) - Number(x.sameName) || y.score - x.score || Math.min(x.a.id, x.b.id) - Math.min(y.a.id, y.b.id) || Math.max(x.a.id, x.b.id) - Math.max(y.a.id, y.b.id))
  return out.slice(0, opts.limit ?? MAX_SUGGESTIONS)
}

/** Existing players closest to a name (for the import's "did you mean" warning). */
export function closestPlayers<T extends Names>(name: Names, players: readonly T[], n = 3, min = 70): T[] {
  return players
    .map((p) => ({ p, s: nameSimilarity(name, p).score }))
    .filter((x) => x.s >= min)
    .sort((x, y) => y.s - x.s)
    .slice(0, n)
    .map((x) => x.p)
}
