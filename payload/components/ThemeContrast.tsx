'use client'
import { useForm, useFormFields } from '@payloadcms/ui'
import { checkTheme, colorsFromForm } from '../../lib/theme/contrast'
import { suggestShades } from '../../lib/theme/derive'
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
  const { dispatchFields, setModified } = useForm()
  const colors = colorsFromForm({ palette, shades }, seedColors())
  const suggest = () => {
    const next = suggestShades(colors.gold, colors.black, colors.cream)
    if (!next) return
    for (const [name, hex] of Object.entries(next)) dispatchFields({ type: 'UPDATE', path: `shades.${name}`, value: hex, valid: true })
    setModified(true)
  }
  const revert = () => {
    if (window.confirm('Throw away your unsaved colour changes and go back to the last saved look?')) window.location.reload()
  }
  const errors = results.filter((r) => r.level === 'error' && !r.pass).length
  return (
    <>
    <div className="theme-sample" aria-label="Sample of the colours as you type">
      <p className="theme-sample__note">Sample of your colours (updates as you type)</p>
      <div className="theme-sample__band" style={{ background: colors.black, color: '#fff' }}>
        <span style={{ color: colors.gold }}>Next match</span>
        <strong>Sunday 1pm at home</strong>
        <span className="theme-sample__button" style={{ background: colors.gold, color: colors.black }}>Get tickets</span>
        <span className="theme-sample__button" style={{ background: colors.ink, color: colors['gold-light'] }}>Raised card</span>
      </div>
      <div className="theme-sample__band" style={{ background: colors.cream, color: colors.charcoal }}>
        <span>Body text on the light band</span>
        <span style={{ color: colors.grey }}>Secondary text</span>
        <span className="theme-sample__chip" style={{ background: colors['gold-pale'], color: colors['gold-deep'] }}>Chip</span>
        <span className="theme-sample__chip" style={{ background: colors.stone, color: colors['grey-light'] }}>Card fill caption</span>
      </div>
      <div className="theme-sample__swatches">
        {Object.entries(colors).map(([key, hex]) => (
          <span key={key} className="theme-sample__swatch" title={`${key} ${hex}`}>
            <span style={{ background: hex }} />
            {hex}
          </span>
        ))}
      </div>
      <div className="theme-sample__actions">
        <button type="button" className="btn btn--style-secondary btn--size-small" onClick={suggest}>
          <span className="btn__content">Suggest the other shades from my accent, dark and light colours</span>
        </button>
        <button type="button" className="btn btn--style-secondary btn--size-small" onClick={revert}>
          <span className="btn__content">Revert to last saved</span>
        </button>
      </div>
    </div>
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
    </>
  )
}
