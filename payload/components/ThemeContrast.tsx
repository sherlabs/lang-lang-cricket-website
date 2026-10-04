'use client'
import { useFormFields } from '@payloadcms/ui'
import { checkTheme, colorsFromForm } from '../../lib/theme/contrast'
import { seedColors } from '../../lib/theme/seed-colors'
import { PALETTE_FIELDS, SHADE_FIELDS } from '../../lib/theme/tokens'

const MARK = { pass: 'Pass', warn: 'Check', error: 'Too low' } as const

/**
 * Live readability report on the Site look form: every checked colour pair with its contrast ratio.
 * "Too low" pairs block saving; "Check" pairs are only advice. Reads the form as the designer types.
 */
export function ThemeContrast() {
  const fields = useFormFields(([f]) => f)
  const value = (path: string) => (fields[path]?.value as string | undefined) ?? undefined
  const palette = Object.fromEntries(Object.keys(PALETTE_FIELDS).map((k) => [k, value(`palette.${k}`)]))
  const shades = Object.fromEntries(Object.keys(SHADE_FIELDS).map((k) => [k, value(`shades.${k}`)]))
  const results = checkTheme(colorsFromForm({ palette, shades }, seedColors()))
  const errors = results.filter((r) => r.level === 'error' && !r.pass).length
  return (
    <div className="theme-contrast" aria-live="polite">
      <h3 className="theme-contrast__title">Readability check</h3>
      <p className="theme-contrast__summary">
        {errors === 0 ? 'Every required pair is readable. You can save.' : `${errors} pair${errors === 1 ? ' is' : 's are'} too low and will stop you saving.`}
      </p>
      <ul className="theme-contrast__list">
        {results.map((r) => {
          const state = r.pass ? 'pass' : r.level
          return (
            <li key={r.id} className={`theme-contrast__row theme-contrast__row--${state}`}>
              <span className="theme-contrast__mark">{MARK[state]}</span>
              <span>{r.label}</span>
              <span className="theme-contrast__ratio">
                {r.ratio.toFixed(2)} to 1 (needs {r.min})
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
