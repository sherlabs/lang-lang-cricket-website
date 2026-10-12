import { describe, expect, it } from 'vitest'
import { CAPTION_VARS, composeCopyText, DEFAULT_CAPTIONS, fillTemplate, templatesToSave } from '@/lib/social/caption'
import { SPECS } from '@/lib/social/specs'
import { TYPE_KEYS } from '@/lib/social/types'
import { validateCaptionSettings } from '@/lib/social/settings'
import { FIXTURE_DATA } from './helpers/social-fixtures'

describe('caption templates', () => {
  const allowed = ['club', 'opponent', 'venue', 'link']
  it('fills placeholders from the whitelist as plain text', () => {
    const r = fillTemplate('{club} v {opponent} at {venue}', { club: 'A', opponent: '<b>B</b>', venue: 'V' }, allowed)
    expect(r.text).toBe('A v <b>B</b> at V')
    expect(r.unknown).toEqual([])
  })
  it('leaves unknown placeholders in place and reports them', () => {
    const r = fillTemplate('Hello {club} {nope} {link}', { club: 'A', link: 'L', nope: 'x' }, allowed)
    expect(r.text).toBe('Hello A {nope} L')
    expect(r.unknown).toEqual(['nope'])
  })
  it('drops a whole line when a value is missing, never leaving "v undefined"', () => {
    const r = fillTemplate('{club}\nv {opponent} at {venue}\n{link}', { club: 'A', link: 'L', opponent: 'B', venue: '' }, allowed)
    expect(r.text).toBe('A\nL')
    expect(r.text).not.toMatch(/undefined|null/)
  })
  it('does not execute anything: braces with code are left alone', () => {
    expect(fillTemplate('{club.constructor} ${1+1}', { club: 'A' }, allowed).text).toBe('{club.constructor} ${1+1}')
  })
  it('every default caption uses only its own type placeholders', () => {
    for (const type of TYPE_KEYS) expect(fillTemplate(DEFAULT_CAPTIONS[type], {}, CAPTION_VARS[type]).unknown, type).toEqual([])
  })
  it('every type fills its default caption from fixture data with no leftovers', () => {
    for (const type of TYPE_KEYS) {
      const vars = { ...SPECS[type].captionVars(FIXTURE_DATA[type]), club: 'Test Club', link: 'https://example.org/x' }
      const r = fillTemplate(DEFAULT_CAPTIONS[type], vars, CAPTION_VARS[type])
      expect(r.text, type).not.toMatch(/[{}]/)
      expect(r.text.length, type).toBeGreaterThan(5)
    }
  })
  it('composes the copy text: caption, sign-off, hashtags', () => {
    expect(composeCopyText({ body: ' Hi ', signOff: 'Bye', hashtags: ['a', 'b'] })).toBe('Hi\n\nBye\n\n#a #b')
    expect(composeCopyText({ body: 'Hi' })).toBe('Hi')
  })
  it('validates what the settings panel sends', () => {
    expect(validateCaptionSettings({ hashtags: ['#ok', 'ok_2', 'ok'], signOff: ' x ', captionTemplates: { result: 'a {club}' } })).toEqual({ ok: true, value: { hashtags: [{ tag: 'ok' }, { tag: 'ok_2' }], signOff: 'x', captionTemplates: { result: 'a {club}' } } })
    expect(validateCaptionSettings({ hashtags: ['bad tag'] }).ok).toBe(false)
    expect(validateCaptionSettings({ hashtags: ['@mention'] }).ok).toBe(false)
    expect(validateCaptionSettings({ hashtags: Array.from({ length: 31 }, (_, i) => `t${i}`) }).ok).toBe(false)
    expect(validateCaptionSettings({ captionTemplates: { result: 'x'.repeat(601) } }).ok).toBe(false)
    expect(validateCaptionSettings({ signOff: 'x'.repeat(201) }).ok).toBe(false)
  })
})

describe('saving the caption wording from the composer', () => {
  it('sends the standard wording as empty, so no default is frozen into the settings', () => {
    const resolved = { ...DEFAULT_CAPTIONS, potm: 'Our {award}: {player}\n{link}' }
    const sent = templatesToSave(resolved)
    expect(sent.potm).toBe('Our {award}: {player}\n{link}')
    for (const type of TYPE_KEYS) if (type !== 'potm') expect(sent[type], type).toBe('')
    // And what is sent passes the settings check as is: empty means "standard".
    const checked = validateCaptionSettings({ hashtags: ['LangLang'], signOff: '', captionTemplates: sent })
    expect(checked.ok && Object.values(checked.value.captionTemplates).filter((v) => v !== '').length).toBe(1)
  })
  it('treats wording that only differs in surrounding whitespace as standard', () => {
    expect(templatesToSave({ ...DEFAULT_CAPTIONS, result: `${DEFAULT_CAPTIONS.result}\n` }).result).toBe('')
  })
})
