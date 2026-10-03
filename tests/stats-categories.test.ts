import { describe, expect, it } from 'vitest'
import { classifyGrade, compileRules, parseCategories, validateRulePattern } from '@/lib/stats/categories'
import { isJuniorGrade } from '@/lib/playhq/queries'

describe('classifyGrade', () => {
  const cases: [string | null, string | null, string][] = [
    ['A Grade', 'Lang Lang A Grade', 'senior'],
    ['Thunder', 'Lang Lang Thunder', 'senior'],
    ["Women's Under 16", null, 'junior'],
    ['Over 40s', null, 'masters'],
    ['O35', null, 'masters'],
    ['Masters', null, 'masters'],
    ['Boys', null, 'junior'],
    ['U13s', null, 'junior'],
    ['Under 16s', null, 'junior'],
    ['Under14s', null, 'junior'],
    ['U/14', null, 'junior'],
    ['Under 14 Girls', null, 'junior'],
    ['Mixed T20', null, 'mixed'],
    ["Women's T20", null, 'womens'],
    ['Ladies Twenty20', null, 'womens'],
    ['', 'Lang Lang Over 50s', 'masters'],
    [null, "Lang Lang Women's", 'womens'],
    ['', '', 'senior'],
    ['B Grade', "Lang Lang Women's", 'womens'],
  ]
  it.each(cases)('%s / %s -> %s', (grade, team, want) => {
    expect(classifyGrade(grade, team)).toBe(want)
  })

  it('a senior-by-default grade lets the team name decide, but a real grade match wins', () => {
    expect(classifyGrade('A Grade', 'Lang Lang Under 16')).toBe('junior')
    expect(classifyGrade('Mixed T20', 'Lang Lang Under 16')).toBe('mixed')
  })

  it('admin rules are tried before the built-ins and invalid ones are ignored', () => {
    expect(classifyGrade('Social Cup', null, [{ category: 'mixed', pattern: 'social' }])).toBe('mixed')
    expect(classifyGrade('Boys', null, [{ category: 'senior', pattern: '^boys$' }])).toBe('senior')
    expect(classifyGrade('Boys', null, [{ category: 'mixed', pattern: '(' }])).toBe('junior')
    expect(compileRules([{ category: 'mixed', pattern: 'x'.repeat(101) }])).toEqual([])
  })
})

describe('validateRulePattern', () => {
  it('rejects empty, long, bad regex and bad flags', () => {
    expect(validateRulePattern('')).toMatch(/pattern/)
    expect(validateRulePattern('a'.repeat(101))).toMatch(/100/)
    expect(validateRulePattern('(')).toMatch(/valid/)
    expect(validateRulePattern('a', 'g')).toMatch(/Flags/)
    expect(validateRulePattern('social', 'i')).toBeNull()
  })
})

describe('parseCategories', () => {
  it('whitelists and normalises', () => {
    expect(parseCategories('masters, SENIOR,evil')).toEqual(['senior', 'masters'])
    expect(parseCategories(undefined)).toEqual([])
  })
})

describe('shared junior rules', () => {
  it('sync and classifier agree, and Thunder is no longer junior', () => {
    expect(isJuniorGrade('Under 16')).toBe(true)
    expect(isJuniorGrade('U12 Boys')).toBe(true)
    expect(isJuniorGrade('Youth Cup')).toBe(true)
    expect(isJuniorGrade('Thunder')).toBe(false)
    expect(isJuniorGrade('Winter Cup')).toBe(true)
  })
})
