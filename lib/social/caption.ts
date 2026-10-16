import type { GraphicType } from './types'

/**
 * Caption templates (wave C spec 4.3, the part the composer needs now). `{name}` placeholders are replaced from a per-type whitelist.
 * Values are inserted as plain text; nothing is executed. Unknown placeholders stay in the text and are reported so the screen can
 * warn. A line whose placeholder has no value is dropped whole, so a missing venue never leaves "at  ".
 */
export const CAPTION_VARS: Record<GraphicType, readonly string[]> = {
  result: ['club', 'team', 'opponent', 'grade', 'round', 'score', 'margin', 'venue', 'date', 'link'],
  fixtures: ['club', 'date', 'count', 'link'],
  lineup: ['club', 'team', 'opponent', 'grade', 'round', 'venue', 'date', 'link'],
  potm: ['club', 'award', 'player', 'opponent', 'grade', 'round', 'statline', 'date', 'link'],
  milestone: ['club', 'player', 'milestone', 'link'],
  'stats-leaders': ['club', 'metric', 'season', 'grade', 'leader', 'link'],
  'event-promo': ['club', 'event', 'date', 'time', 'place', 'link'],
  'sponsor-thanks': ['club', 'sponsor', 'tier', 'link'],
  'season-wrap': ['club', 'season', 'record', 'link'],
  toss: ['club', 'winner', 'choice', 'opponent', 'round', 'grade', 'date', 'link'],
}

/** Generic English defaults. A club's own voice is saved in the settings (seed defaults), never written here. */
export const DEFAULT_CAPTIONS: Record<GraphicType, string> = {
  result: '{club} {grade} v {opponent}\n{score}\n{margin}\n{venue}\n{link}',
  fixtures: 'This weekend at {club}: {count} games.\n{date}\n{link}',
  lineup: '{club} {grade} team for {date}\nv {opponent}\n{venue}\n{link}',
  potm: '{award}: {player}\n{statline}\nv {opponent}\n{date}\n{link}',
  milestone: 'Congratulations {player} on {milestone}!\n{link}',
  'stats-leaders': '{metric} leaders for {season}: {leader} is out in front.\n{link}',
  'event-promo': '{event}\n{date} {time}\n{place}\n{link}',
  'sponsor-thanks': 'Thank you to {sponsor}.\n{tier} sponsor of {club}.\n{link}',
  'season-wrap': '{season} at {club}: {record}\n{link}',
  toss: '{club} {grade} v {opponent}\n{winner} won the toss.\n{choice}\n{link}',
}

/**
 * What the composer sends when it saves the caption wording. The club's own wording is stored only where it differs from the standard
 * text; a wording equal to the standard is sent as empty, so no default is ever frozen into the settings and a later change to the
 * standard wording still reaches the club.
 */
export function templatesToSave(templates: Record<GraphicType, string>): Partial<Record<GraphicType, string>> {
  const out: Partial<Record<GraphicType, string>> = {}
  for (const type of Object.keys(DEFAULT_CAPTIONS) as GraphicType[]) {
    const v = templates[type]
    if (typeof v !== 'string') continue
    out[type] = v.trim() === DEFAULT_CAPTIONS[type].trim() ? '' : v
  }
  return out
}

const PLACEHOLDER = /\{([a-zA-Z][a-zA-Z0-9]*)\}/g

export type FilledCaption = { text: string; unknown: string[] }

export function fillTemplate(template: string, vars: Record<string, string | undefined>, allowed: readonly string[]): FilledCaption {
  const unknown = new Set<string>()
  const lines: string[] = []
  for (const line of template.split(/\r?\n/)) {
    let drop = false
    const out = line.replace(PLACEHOLDER, (whole, name: string) => {
      if (!allowed.includes(name)) {
        unknown.add(name)
        return whole
      }
      const v = vars[name]
      if (v == null || String(v).trim() === '') {
        drop = true
        return ''
      }
      return String(v)
    })
    if (!drop) lines.push(out.trimEnd())
  }
  // Collapse the blank runs that dropped lines leave behind.
  const text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  return { text, unknown: [...unknown] }
}

/** What "Copy caption" puts on the clipboard: the filled caption, the sign-off line and the hashtags as `#tag #tag`. */
export function composeCopyText(o: { body: string; signOff?: string; hashtags?: readonly string[] }): string {
  const tags = (o.hashtags ?? []).map((t) => `#${t}`).join(' ')
  return [o.body.trim(), (o.signOff ?? '').trim(), tags].filter(Boolean).join('\n\n')
}

/** A milestone that is still ahead is not a congratulation: this generic wording replaces the club's template for it. */
export const APPROACHING_CAPTION = '{player}: {milestone}. Come and cheer them on at {club}!\n{link}'
