import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { displayName } from '@/payload/hooks/displayName'
import { resolveStatsSettings } from '@/lib/site-settings-core'
import { labelHeaders } from '@/lib/stats/match/label-headers'
import { buildLabelMap, canonicalGrade, canonicalOpponent, canonicalTeam, resolveGradeParam } from '@/lib/stats/labels'
import { classifyGrade } from '@/lib/stats/categories'
import type { FactSet, MatchHeader } from '@/lib/stats/match/types'
import { emptyFactSet } from '@/lib/stats/match/types'
import { shownName } from '@/lib/players/view'

const sample = (label: string, count = 1, kind: 'grade' | 'team' = 'grade') => ({ kind, label, count })

describe('label map with counts and renames', () => {
  it('the most frequent spelling wins, a tie goes to the alphabetically first, an admin rename beats both', () => {
    const map = buildLabelMap([sample('Demo B Grade', 6), sample('Demo B grade', 38), sample('2. Demo District', 1), sample('Demo District', 1)])
    expect(canonicalGrade('Demo B Grade', map)).toBe('Demo B grade')
    expect(canonicalGrade('  demo   b GRADE ', map)).toBe('Demo B grade')
    expect(canonicalGrade('Demo District', map)).toBe('2. Demo District')
    const renamed = buildLabelMap([sample('Demo B Grade', 6), sample('Demo B grade', 38)], [{ kind: 'grade', from: 'demo b grade', to: 'Demo Second XI' }])
    expect(canonicalGrade('Demo B Grade', renamed)).toBe('Demo Second XI')
    expect(canonicalGrade('Demo B grade', renamed)).toBe('Demo Second XI')
  })

  it('the rename category effect: the shown label is what the category rules see', () => {
    const map = buildLabelMap([sample('Demo C Grade')], [{ kind: 'grade', from: 'Demo C Grade', to: 'Demo Under 14 Girls' }])
    expect(classifyGrade('Demo C Grade', null, [])).toBe('senior')
    expect(classifyGrade(canonicalGrade('Demo C Grade', map), null, [])).toBe('junior')
  })

  it('teams and opponents are separate kinds; an opponent rename targets an opposition key', () => {
    const map = buildLabelMap([sample('B Grade', 1, 'team')], [{ kind: 'team', from: 'b grade', to: 'Seconds' }, { kind: 'opponent', from: 'Old Name FC', to: 'org-123' }])
    expect(canonicalTeam('B Grade', map)).toBe('Seconds')
    expect(canonicalGrade('B Grade', map)).toBe('B Grade')
    expect(canonicalOpponent('old   name fc', map)).toBe('org-123')
  })
})

describe('resolveGradeParam (shared links)', () => {
  const known = ['Demo B grade', 'Demo District']
  it('exact, then mapped, then same normalised label, else null', () => {
    expect(resolveGradeParam('Demo District', known)).toBe('Demo District')
    expect(resolveGradeParam('2. Demo District', known)).toBe('Demo District')
    expect(resolveGradeParam('demo b GRADE', known)).toBe('Demo B grade')
    expect(resolveGradeParam('Old Name', known, (r) => (r === 'Old Name' ? 'Demo District' : r))).toBe('Demo District')
    expect(resolveGradeParam('Nope', known)).toBeNull()
    expect(resolveGradeParam('', known)).toBeNull()
  })
})

describe('settings', () => {
  it('keeps valid renames, drops blank and unknown-kind rows, caps the list', () => {
    const s = resolveStatsSettings({ labelRenames: [{ kind: 'grade', from: ' A ', to: ' B ' }, { kind: 'bogus', from: 'x', to: 'y' }, { kind: 'team', from: '', to: 'y' }, 'junk'] })
    expect(s.labelRenames).toEqual([{ kind: 'grade', from: 'A', to: 'B' }])
    expect(resolveStatsSettings(undefined).labelRenames).toEqual([])
    expect(resolveStatsSettings({ labelRenames: Array.from({ length: 300 }, (_, i) => ({ kind: 'grade', from: `a${i}`, to: 'b' })) }).labelRenames).toHaveLength(200)
  })
})

describe('match headers', () => {
  const header = (id: number, over: Partial<MatchHeader>): MatchHeader => ({
    id, gameId: `g${id}`, date: '2025-11-02', seasonName: 'Summer 2025/26', seasonStartYear: 2025, grade: 'Demo B grade', team: 'Demo B', format: 'oneDay', result: 'won', forfeit: false,
    firstInnings: false, oppKey: 'n:old-name-fc', oppLabel: 'Old Name FC', ...over,
  })
  it('apply grade, team and opponent labels to every header', () => {
    const set: FactSet = emptyFactSet()
    set.matches.set(1, header(1, {}))
    set.matches.set(2, header(2, { grade: 'Demo B Grade', oppKey: 'org-123', oppLabel: 'New Name CC' }))
    const map = buildLabelMap([sample('Demo B Grade', 5), sample('Demo B grade', 1)], [{ kind: 'opponent', from: 'Old Name FC', to: 'org-123' }])
    const out = labelHeaders(set, map)
    expect([...out.matches.values()].map((h) => h.grade)).toEqual(['Demo B Grade', 'Demo B Grade'])
    expect(out.matches.get(1)!.oppKey).toBe('org-123')
    expect(out.matches.get(2)!.oppKey).toBe('org-123')
  })
})

describe('preferred name', () => {
  const run = (data: Record<string, unknown>, originalDoc: Record<string, unknown> = {}, ctx: Record<string, unknown> = {}) =>
    (displayName as unknown as (a: unknown) => string)({ value: 'x', data, originalDoc, req: { context: ctx } })
  it('the display name is the preferred name, else the full name', () => {
    expect(run({ firstName: 'Jonathan', lastName: 'Smith' })).toBe('Jonathan Smith')
    expect(run({ firstName: 'Jonathan', lastName: 'Smith', preferredName: 'Chook' })).toBe('Chook')
    expect(run({ lastName: 'Smythe' }, { firstName: 'Jonathan', lastName: 'Smith', preferredName: 'Chook' })).toBe('Chook')
    expect(run({ preferredName: '' }, { firstName: 'Jonathan', lastName: 'Smith', preferredName: 'Chook' })).toBe('Jonathan Smith')
    expect(run({ preferredName: '   ' }, { firstName: 'Jonathan', lastName: 'Smith' })).toBe('Jonathan Smith')
  })
  it('shownName prefers displayName', () => {
    expect(shownName({ firstName: 'A', lastName: 'B', displayName: 'Chook' })).toBe('Chook')
    expect(shownName({ firstName: 'A', lastName: 'B', displayName: '  ' })).toBe('A B')
    expect(shownName({ firstName: 'A', lastName: 'B' })).toBe('A B')
  })
})

/** Source files that read a name or a grade label straight from the data must go through the shared helpers. */
function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(f)) out.push(p)
  }
  return out
}
const root = path.resolve(__dirname, '..')
const sources = ['lib', 'app', 'components'].flatMap((d) => walk(path.join(root, d)))
const rel = (p: string) => path.relative(root, p)

describe('single source for names and labels', () => {
  it('nothing outside lib/players/view.ts builds a player name from first and last name with playerName()', () => {
    const offenders = sources.filter((f) => /\bplayerName\(/.test(readFileSync(f, 'utf8')) && rel(f) !== 'lib/players/view.ts').map(rel)
    expect(offenders).toEqual([])
  })

  it('the files that read a raw gradeName from stored rows are exactly the known ones (new readers must use the label map)', () => {
    const readers = sources
      .filter((f) => /\.gradeName\b|gradeName:/.test(readFileSync(f, 'utf8')))
      .map(rel)
      .filter((f) => !/^lib\/(playhq|history-import|payload)\//.test(f))
      .sort()
    expect(readers).toEqual(
      [
        // Read the stored rows and tidy them (getVisibleStatData / getSeasonFacts / yearbook result lines apply the label map).
        'lib/stats/queries.ts', 'lib/stats/aggregate.ts', 'lib/stats/leaderboard.ts', 'lib/stats/categories.ts', 'lib/stats/labels.ts',
        'lib/stats/statlab.ts', 'lib/stats/yearbook.ts', 'lib/stats/match/facts.ts', 'lib/stats/match/yearbook.ts',
        'lib/players/profile-extras.ts', 'lib/players/sync.ts', 'lib/players/plan.ts', 'lib/players/duplicate-queries.ts',
        'lib/match-store/read.ts',
        // PlayHQ fixtures and ladders (not the stored data).
        'lib/matches-queries.ts', 'lib/domain.ts', 'app/(frontend)/fixtures/page.tsx', 'app/(frontend)/fixtures/[gameId]/page.tsx',
        'components/playhq/game-rows.tsx', 'components/playhq/team-grid.tsx',
      ].sort(),
    )
  })
})

describe('renamed grades keep their category', () => {
  it('classifies by the shown label, then the raw one', async () => {
    const { withRenamedGradeRules } = await import('@/lib/site-settings-core')
    const { classifyGrade } = await import('@/lib/stats/categories')
    const base = resolveStatsSettings({ labelRenames: [{ kind: 'grade', from: "Women's A Grade", to: 'Premier' }, { kind: 'grade', from: 'B Grade', to: 'Seconds' }] })
    const s = withRenamedGradeRules(base)
    expect(classifyGrade('Premier', null, base.gradeRules)).toBe('senior')
    expect(classifyGrade('Premier', null, s.gradeRules)).toBe('womens')
    expect(classifyGrade('Seconds', null, s.gradeRules)).toBe('senior')
    expect(base.gradeRules).toEqual([])
  })
})
