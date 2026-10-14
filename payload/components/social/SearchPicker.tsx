'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import { filterChoices, groupChoices, moveActive, MULTI_LIMIT, toggleMulti, type PickerKey } from '@/lib/social/picker'
import type { SourceChoice } from '@/lib/social/types'
import { Icon, StatusPill } from '../ui'

/**
 * The searchable picker (wave G WP-2a): one list for games, sponsors, events, players, with a search box, rows that show what the
 * thing is (a date tile and a result badge for a game, the logo for a sponsor), a chip tray in multi mode and a four-item limit.
 * It is a combobox over a listbox, so the arrow keys, Home, End and Enter work, and the highlighted row is announced.
 */
type Props = {
  choices: SourceChoice[]
  multi: boolean
  /** Selected ids (one in single mode). */
  selected: string[]
  onChange: (ids: string[]) => void
  /** Base of the staff-only API, for sponsor logo thumbnails. */
  api: string
  locale: string
  label: string
  empty: string
  disabled?: boolean
}

const PLACEHOLDER: Record<string, string> = {
  game: 'Search by team, grade, date or opponent',
  sponsor: 'Search sponsors',
  event: 'Search events',
}

const dayParts = (iso: string, locale: string): { day: string; month: string } | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const d = new Date(`${iso}T00:00:00Z`)
  return { day: String(d.getUTCDate()), month: new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(d) }
}

function DateTile({ iso, locale, upcoming }: { iso: string; locale: string; upcoming?: boolean }) {
  const p = dayParts(iso, locale)
  return (
    <span className={`social-date${upcoming ? ' is-upcoming' : ''}`} aria-hidden="true">
      <strong>{p?.day ?? '-'}</strong>
      <span>{p?.month ?? ''}</span>
    </span>
  )
}

function Thumb({ choice, api }: { choice: SourceChoice; api: string }) {
  const row = choice.row
  if (row?.kind !== 'sponsor') return null
  return row.logo === 'ok' ? (
    // eslint-disable-next-line @next/next/no-img-element -- a staff-only same-origin PNG, not a site image
    <img className="social-thumb" src={`${api}/logo/${choice.id}`} alt="" width={44} height={44} loading="lazy" />
  ) : (
    <span className="social-thumb social-thumb--none" aria-hidden="true">{row.name.slice(0, 1).toUpperCase()}</span>
  )
}

function RowBody({ c, api, locale }: { c: SourceChoice; api: string; locale: string }) {
  const row = c.row
  if (row?.kind === 'game') {
    return (
      <>
        <DateTile iso={row.date} locale={locale} upcoming={row.upcoming} />
        <span className="social-row__main">
          <span className="social-row__title">{row.title}</span>
          <span className="social-row__sub">{row.subtitle}</span>
          {row.score ? <span className="social-row__score">{row.score}</span> : null}
        </span>
        {row.result ? <StatusPill tone={row.result.tone}>{row.result.label}</StatusPill> : null}
      </>
    )
  }
  if (row?.kind === 'sponsor') {
    return (
      <>
        <Thumb choice={c} api={api} />
        <span className="social-row__main">
          <span className="social-row__title">{row.name}</span>
          {row.logo === 'failed' ? <span className="social-row__sub" title={c.note}>Logo cannot be used</span> : null}
        </span>
        {row.logo !== 'ok' ? <span className="social-tag">name only</span> : null}
        <StatusPill tone="neutral">{row.tier}</StatusPill>
      </>
    )
  }
  if (row?.kind === 'event') {
    return (
      <>
        <DateTile iso={row.date} locale={locale} upcoming />
        <span className="social-row__main"><span className="social-row__title">{row.title}</span></span>
      </>
    )
  }
  return <span className="social-row__main"><span className="social-row__title">{c.label}</span>{c.note ? <span className="social-row__sub">{c.note}</span> : null}</span>
}

export function SearchPicker({ choices, multi, selected, onChange, api, locale, label, empty, disabled }: Props) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(-1)
  const [full, setFull] = useState(false)
  const uid = useId()
  const shown = useMemo(() => filterChoices(choices, query, locale), [choices, query, locale])
  const groups = useMemo(() => groupChoices(shown), [shown])
  const flat = useMemo(() => groups.flatMap((g) => g.choices), [groups])
  const nameOf = (id: string): string => {
    const c = choices.find((x) => x.id === id)
    return c?.row?.kind === 'sponsor' ? c.row.name : (c?.label ?? id)
  }

  useEffect(() => {
    // The highlight follows the filter: a new search starts at the top row.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when the visible list changes
    setActive(flat.length > 0 && query ? 0 : -1)
  }, [query, flat.length])
  useEffect(() => {
    if (active >= 0) document.getElementById(`${uid}-o${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [active, uid])

  const choose = (c: SourceChoice) => {
    if (disabled) return
    if (!multi) { onChange([c.id]); return }
    const r = toggleMulti(selected, c.id)
    setFull(r.full)
    if (!r.full) onChange(r.ids)
  }

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
      if ((e.key === 'Home' || e.key === 'End') && !e.ctrlKey && query) return // inside the text, Home and End move the caret
      e.preventDefault()
      setActive((a) => moveActive(a, e.key as PickerKey, flat.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (active >= 0 && flat[active]) choose(flat[active])
    } else if (e.key === 'Escape' && query) {
      e.preventDefault()
      setQuery('')
    }
  }

  const offsets = groups.map((_, gi) => groups.slice(0, gi).reduce((n, g) => n + g.choices.length, 0))
  return (
    <div className="social-picker">
      <div className="social-picker__search">
        <Icon name="search" size={18} />
        <input
          type="search"
          role="combobox"
          aria-expanded="true"
          aria-controls={`${uid}-list`}
          aria-activedescendant={active >= 0 ? `${uid}-o${active}` : undefined}
          aria-label={`Search: ${label}`}
          placeholder={PLACEHOLDER[choices[0]?.row?.kind ?? ''] ?? 'Search by name'}
          autoComplete="off"
          value={query}
          disabled={disabled}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
        />
      </div>

      {multi && selected.length > 0 ? (
        <ul className="social-chips" aria-label="Chosen">
          {selected.map((id) => (
            <li key={id}>
              <span className="social-chip">
                {nameOf(id)}
                <button type="button" className="social-chip__x" aria-label={`Remove ${nameOf(id)}`} onClick={() => { setFull(false); onChange(selected.filter((x) => x !== id)) }}>
                  <Icon name="close" size={14} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {multi ? <p className="social-hint" role="status">{full ? `That is ${MULTI_LIMIT} already. Remove one to add another.` : `Choose up to ${MULTI_LIMIT}. ${selected.length} chosen.`}</p> : null}

      {choices.length === 0 ? <p className="social-hint">{empty}</p> : null}
      {choices.length > 0 && flat.length === 0 ? <p className="social-hint" role="status">Nothing matches &ldquo;{query}&rdquo;. Try fewer words.</p> : null}
      <ul id={`${uid}-list`} role="listbox" aria-label={label} aria-multiselectable={multi || undefined} className="social-list" hidden={flat.length === 0}>
        {groups.map((g, gi) => (
          <li key={g.heading || 'all'} role="presentation" className="social-group">
            {g.heading ? <span className="social-group__heading" role="presentation">{g.heading}</span> : null}
            <ul role="presentation" className="social-group__rows">
              {g.choices.map((c, ci) => {
                const i = offsets[gi] + ci
                const on = selected.includes(c.id) || Boolean(c.variants?.some((v) => selected.includes(v.id)))
                return (
                  <li
                    key={c.id}
                    id={`${uid}-o${i}`}
                    role="option"
                    aria-selected={on}
                    className={`social-row${on ? ' is-on' : ''}${i === active ? ' is-active' : ''}`}
                    onClick={() => choose(c)}
                  >
                    <span className="social-row__mark" aria-hidden="true">{on ? <Icon name="check" size={16} /> : null}</span>
                    <RowBody c={c} api={api} locale={locale} />
                  </li>
                )
              })}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  )
}
