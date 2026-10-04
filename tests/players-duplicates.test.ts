import { describe, expect, it } from 'vitest'
import { blockKeys, closestPlayers, editDistanceOne, jaroWinkler, nameSimilarity, pairKey, soundex, suggestDuplicates, type DupPlayer } from '@/lib/players/duplicates'

const p = (id: number, firstName: string, lastName: string, seasons: DupPlayer['seasons'] = [], over: Partial<DupPlayer> = {}): DupPlayer => ({ id, firstName, lastName, hidden: false, games: 5, seasons, ...over })
const season = (year: number, team: string, grade = 'A') => ({ seasonStartYear: year, teamKey: team, grade })

describe('name similarity', () => {
  it('scores the named cases', () => {
    expect(nameSimilarity({ firstName: 'John', lastName: 'Smith' }, { firstName: 'john', lastName: 'SMITH' }).score).toBe(100)
    expect(nameSimilarity({ firstName: 'John', lastName: 'Smith' }, { firstName: 'Smith', lastName: 'John' }).reason).toContain('other way round')
    expect(nameSimilarity({ firstName: 'J', lastName: 'Smith' }, { firstName: 'John', lastName: 'Smith' }).reason).toContain('Initial')
    expect(nameSimilarity({ firstName: 'Jon', lastName: 'Smith' }, { firstName: 'John', lastName: 'Smith' }).score).toBe(85)
    expect(nameSimilarity({ firstName: 'John', lastName: 'Smyth' }, { firstName: 'John', lastName: 'Smith' }).score).toBe(85)
    expect(nameSimilarity({ firstName: 'Anna', lastName: 'Lee' }, { firstName: 'Zed', lastName: 'Park' }).score).toBeLessThan(60)
  })

  it('helpers', () => {
    expect(jaroWinkler('martha', 'marhta')).toBeGreaterThan(0.95)
    expect(editDistanceOne('smith', 'smyth')).toBe(true)
    expect(editDistanceOne('smith', 'smith')).toBe(false)
    expect(editDistanceOne('smith', 'smithe')).toBe(true)
    expect(editDistanceOne('smith', 'smoot')).toBe(false)
    expect(soundex('Robert')).toBe(soundex('Rupert'))
    expect(soundex('Smith')).toBe(soundex('Smyth'))
  })
})

describe('blocking', () => {
  it('shares a key by last name, sound or swapped names', () => {
    const k = (a: [string, string]) => new Set(blockKeys({ firstName: a[0], lastName: a[1] }))
    const inter = (x: Set<string>, y: Set<string>) => [...x].some((v) => y.has(v))
    expect(inter(k(['John', 'Smith']), k(['Jon', 'Smith']))).toBe(true)
    expect(inter(k(['John', 'Smith']), k(['Jon', 'Smyth']))).toBe(true)
    expect(inter(k(['John', 'Smith']), k(['Smith', 'John']))).toBe(true)
    expect(inter(k(['John', 'Smith']), k(['Mary', 'Jones']))).toBe(false)
  })
})

describe('suggestions', () => {
  const a = p(1, 'John', 'Smith', [season(2023, 'T1')])
  const b = p(2, 'Jon', 'Smith', [season(2024, 'T1')])
  const c = p(3, 'John', 'Smith', [season(2019, 'T9', 'C')])
  const d = p(4, 'Mary', 'Jones')

  it('ranks same-name pairs first, then by score, with reasons', () => {
    const s = suggestDuplicates([a, b, c, d])
    expect(s.length).toBeGreaterThan(0)
    expect(s[0].sameName).toBe(true)
    expect([s[0].a.id, s[0].b.id].sort()).toEqual([1, 3])
    const jonPair = s.find((x) => [x.a.id, x.b.id].sort().join() === '1,2')!
    expect(jonPair.reasons.join(' ')).toContain('same team in neighbouring seasons')
    expect(jonPair.score).toBeGreaterThanOrEqual(60)
    expect(s.some((x) => x.a.id === 4 || x.b.id === 4)).toBe(false)
  })

  it('never suggests two players who appeared in the same game, or a dismissed pair', () => {
    const veto = suggestDuplicates([a, b, c], { sameGame: new Set([pairKey(1, 3)]), dismissed: new Set([pairKey(1, 2)]) })
    expect(veto.map((x) => pairKey(x.a.id, x.b.id))).not.toContain('1|3')
    expect(veto.map((x) => pairKey(x.a.id, x.b.id))).not.toContain('1|2')
  })

  it('same grade, same season, different teams is a penalty', () => {
    const x = p(5, 'Jon', 'Smith', [season(2024, 'TA')])
    const y = p(6, 'John', 'Smith', [season(2024, 'TB')])
    expect(suggestDuplicates([x, y], { min: 0 })[0].score).toBeLessThan(suggestDuplicates([p(5, 'Jon', 'Smith', [season(2024, 'TA')]), p(6, 'John', 'Smith', [season(2024, 'TA')])], { min: 0 })[0].score)
  })

  it('caps the list and is deterministic', () => {
    const many = Array.from({ length: 80 }, (_, i) => p(i + 1, i % 2 ? 'Sam' : 'Samuel', 'Same'))
    const one = suggestDuplicates(many, { limit: 50 })
    expect(one).toHaveLength(50)
    expect(suggestDuplicates(many, { limit: 50 }).map((s) => pairKey(s.a.id, s.b.id))).toEqual(one.map((s) => pairKey(s.a.id, s.b.id)))
  })

  it('includes hidden players', () => {
    const h = p(7, 'John', 'Smith', [], { hidden: true })
    expect(suggestDuplicates([a, h]).some((s) => s.b.hidden || s.a.hidden)).toBe(true)
  })
})

describe('closestPlayers', () => {
  it('finds near names for the import warning', () => {
    const near = closestPlayers({ firstName: 'Jon', lastName: 'Smith' }, [a_(), p(9, 'Mary', 'Jones')])
    expect(near.map((x) => x.id)).toEqual([1])
  })
})
function a_() { return p(1, 'John', 'Smith') }
