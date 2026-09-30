import { describe, it, expect } from 'vitest'
import { eventMealOptions, isValidPaymentUrl, normaliseMealOptions, resolveMeal } from '@/lib/events-meal'

describe('normaliseMealOptions', () => {
  it('trims, drops blanks and dedupes case-insensitively keeping the first spelling', () => {
    expect(normaliseMealOptions(' Beef \n\nchicken\nBeef\nCHICKEN\n Veg ')).toEqual(['Beef', 'chicken', 'Veg'])
    expect(normaliseMealOptions(['', '  '])).toEqual([])
    expect(normaliseMealOptions('')).toEqual([])
  })
})

describe('eventMealOptions', () => {
  it('returns [] for missing or malformed values', () => {
    expect(eventMealOptions({})).toEqual([])
    expect(eventMealOptions({ mealOptions: 'Beef' })).toEqual([])
    expect(eventMealOptions({ mealOptions: ['Beef', 3, ''] })).toEqual(['Beef'])
  })
})

describe('isValidPaymentUrl', () => {
  it('accepts empty and absolute http(s) URLs only', () => {
    expect(isValidPaymentUrl('')).toBe(true)
    expect(isValidPaymentUrl('https://square.link/u/abc')).toBe(true)
    expect(isValidPaymentUrl('http://example.com/pay')).toBe(true)
    expect(isValidPaymentUrl('javascript:alert(1)')).toBe(false)
    expect(isValidPaymentUrl('square.link/u/abc')).toBe(false)
    expect(isValidPaymentUrl('https://')).toBe(false)
  })
})

describe('resolveMeal', () => {
  const options = ['Beef', 'Chicken']
  it('requires the dinner yes/no answer when coming and options exist', () => {
    expect(resolveMeal('yes', { dinner: '', meal: 'Beef' }, options)).toEqual({ error: 'Please tell us whether you want dinner.' })
    expect(resolveMeal('yes', { dinner: 'maybe', meal: 'Beef' }, options)).toEqual({ error: 'Please tell us whether you want dinner.' })
  })
  it('dinner yes requires one of the options', () => {
    expect(resolveMeal('yes', { dinner: 'yes', meal: '' }, options)).toEqual({ error: 'Please choose a dinner option.' })
    expect(resolveMeal('yes', { dinner: 'yes', meal: 'Fish' }, options)).toEqual({ error: 'That dinner option is not available.' })
    expect(resolveMeal('yes', { dinner: 'yes', meal: ' Beef ' }, options)).toEqual({ meal: 'Beef' })
  })
  it('dinner no forces an empty meal even if a type was sent', () => {
    expect(resolveMeal('yes', { dinner: 'no', meal: 'Beef' }, options)).toEqual({ meal: '' })
  })
  it('clears the meal when not coming or when the event has no options', () => {
    expect(resolveMeal('no', { dinner: 'yes', meal: 'Beef' }, options)).toEqual({ meal: '' })
    expect(resolveMeal('yes', { dinner: '', meal: 'Beef' }, [])).toEqual({ meal: '' })
  })
})
