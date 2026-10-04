import { describe, expect, it } from 'vitest'
import { Theme } from '../payload/globals/Theme'
import { FONT_KEYS } from '../lib/theme/tokens'
import { loadSanitizedConfig } from './helpers/sanitized-config'

const admin = { id: 1, role: 'admin' }
const editor = { id: 2, role: 'editor' }
type Field = { name?: string; type: string; defaultValue?: unknown; fields?: Field[]; options?: { value: string }[] }

const flat = (fields: Field[]): Field[] => fields.flatMap((f) => (f.fields ? [f, ...flat(f.fields)] : [f]))

describe('theme global (sanitized config)', () => {
  it('is registered, ungrouped, public-read, admin-write, hidden from editors', async () => {
    const config = await loadSanitizedConfig()
    const g = config.globals.find((x) => x.slug === 'theme')!
    expect(g).toBeTruthy()
    expect(g.admin.group).toBe(false)
    const hidden = g.admin.hidden as (a: { user: unknown }) => boolean
    expect(hidden({ user: editor })).toBe(true)
    expect(hidden({ user: admin })).toBe(false)
    const ctx = (user: unknown) => ({ req: { user } }) as never
    expect(g.access!.read!(ctx(null))).toBe(true)
    expect(g.access!.update!(ctx(admin))).toBe(true)
    expect(g.access!.update!(ctx(editor))).toBe(false)
    expect(g.access!.update!(ctx(null))).toBe(false)
  }, 30_000)

  it('every default is a function (club-neutral migration) and the font menu is the fixed one', () => {
    const fields = flat(Theme.fields as Field[]).filter((f) => f.name && f.type !== 'group' && f.type !== 'ui' && f.type !== 'upload' && f.type !== 'date')
    expect(fields).toHaveLength(13)
    for (const f of fields) expect(typeof f.defaultValue, f.name).toBe('function')
    const font = fields.find((f) => f.name === 'headingFont')!
    expect(font.options!.map((o) => o.value)).toEqual([...FONT_KEYS])
  })

  const hook = Theme.hooks!.beforeValidate![0] as (a: { data?: unknown; originalDoc?: unknown }) => unknown

  it('beforeValidate rejects a failing contrast pair with a plain message on the field', () => {
    let err: { data?: { errors: { path: string; message: string }[] } } | undefined
    try {
      hook({ data: { palette: { text: '#CCCCCC' } }, originalDoc: undefined })
    } catch (e) {
      err = e as typeof err
    }
    expect(err).toBeTruthy()
    const errors = err!.data!.errors
    expect(errors.some((e) => e.path === 'palette.text' && /contrast/.test(e.message))).toBe(true)
  })

  it('beforeValidate passes the seed and a valid change, merging over the saved doc', () => {
    expect(() => hook({ data: {}, originalDoc: {} })).not.toThrow()
    expect(() => hook({ data: { palette: { accent: '#4B96F0' } }, originalDoc: { palette: { primary: '#0A1F44' } } })).not.toThrow()
  })

  it('hex fields normalise a three-digit value and validate six digits', () => {
    const accent = flat(Theme.fields as Field[]).find((f) => f.name === 'accent') as Field & {
      hooks: { beforeValidate: ((a: { value: unknown }) => unknown)[] }
      validate: (v: unknown) => true | string
    }
    expect(accent.hooks.beforeValidate[0]({ value: '#abc' })).toBe('#AABBCC')
    expect(accent.validate('#AABBCC')).toBe(true)
    expect(accent.validate('red')).toMatch(/six hex digits/)
    expect(accent.validate('#12345')).toMatch(/six hex digits/)
  })
})
