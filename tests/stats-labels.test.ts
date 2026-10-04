import { describe, expect, it } from 'vitest'
import { applyLabels, buildLabelMap, canonicalGrade, canonicalOpponent, canonicalTeam, normaliseLabel, sameLabel } from '@/lib/stats/labels'

describe('normaliseLabel', () => {
  it.each([
    ['2. Senior Men District', 'senior men district'], ['2) Senior Men District', 'senior men district'], ['  Senior   Men  B Grade ', 'senior men b grade'],
    ['Senior Men B grade', 'senior men b grade'], [null, ''],
  ])('%s -> %s', (raw, out) => expect(normaliseLabel(raw)).toBe(out))
  it('keeps a number that is part of the name', () => expect(normaliseLabel('Under 14')).toBe('under 14'))
})

describe('canonical labels', () => {
  const samples = [
    ...Array(38).fill('Senior Men B Grade'), ...Array(6).fill('Senior Men B grade'),
    '2. Senior Men District', 'Senior Men District', 'Senior Men District',
  ].map((label) => ({ kind: 'grade' as const, label }))
  const map = buildLabelMap(samples)

  it('collapses case, spacing and numbering variants to the most frequent spelling', () => {
    expect(canonicalGrade('Senior Men B grade', map)).toBe('Senior Men B Grade')
    expect(canonicalGrade('2. Senior Men District', map)).toBe('Senior Men District')
    expect(canonicalGrade('Senior Men  B Grade', map)).toBe('Senior Men B Grade')
  })
  it('breaks a frequency tie alphabetically so the result is deterministic', () => {
    const a = buildLabelMap([{ kind: 'grade', label: 'b grade' }, { kind: 'grade', label: 'B Grade' }])
    const b = buildLabelMap([{ kind: 'grade', label: 'B Grade' }, { kind: 'grade', label: 'b grade' }])
    expect(canonicalGrade('B GRADE', a)).toBe(canonicalGrade('B GRADE', b))
  })
  it('an admin rename wins over the data', () => {
    const renamed = buildLabelMap(samples, [{ kind: 'grade', from: 'Senior Men District', to: 'Premier' }])
    expect(canonicalGrade('2. Senior Men District', renamed)).toBe('Premier')
  })
  it('keeps kinds apart and an unknown label as it is', () => {
    expect(canonicalTeam('Senior Men B Grade', map)).toBe('Senior Men B Grade')
    expect(canonicalOpponent('Somebody FC', map)).toBe('Somebody FC')
    expect(canonicalGrade('', map)).toBe('')
  })
  it('applyLabels rewrites grade and team labels and passes other fields through', () => {
    const [r] = applyLabels([{ gradeName: 'Senior Men B grade', teamName: null, id: 3 }], map)
    expect(r).toEqual({ gradeName: 'Senior Men B Grade', teamName: null, id: 3 })
  })
  it('sameLabel compares after normalisation', () => {
    expect(sameLabel('2. Senior Men District', 'senior men district')).toBe(true)
    expect(sameLabel('A Grade', 'B Grade')).toBe(false)
  })
})
