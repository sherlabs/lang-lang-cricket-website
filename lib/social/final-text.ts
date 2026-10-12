import type { Network, NetworkAdapter } from './adapters/types'

/**
 * The words that go out (wave C spec 4.3). `composeFinalText` runs ONCE, inside the schedule action, and its result is stored on each
 * target; the publisher sends it verbatim and never recomposes it from settings. Pure, so changing the settings later cannot touch it.
 */
export type TextLimits = Pick<NetworkAdapter['limits'], 'maxChars' | 'maxHashtags'>

const TAG = /^[A-Za-z0-9_]{1,40}$/

/** Tags are letters, digits and underscores only: no mentions, links or hash signs. */
export const cleanHashtags = (tags: readonly string[]): string[] => [...new Set(tags.map((t) => t.replace(/^#/, '').trim()).filter((t) => TAG.test(t)))]

export function composeFinalText(o: { body: string; signOff?: string; hashtags: readonly string[]; limits: TextLimits }): string {
  const tags = cleanHashtags(o.hashtags).slice(0, o.limits.maxHashtags).map((t) => `#${t}`).join(' ')
  return [o.body.trim(), (o.signOff ?? '').trim(), tags].filter(Boolean).join('\n\n')
}

const URL_RE = /https?:\/\/\S+/g
/** X counts every link as 23 characters, whatever its length. */
export const X_LINK_LENGTH = 23

/** Length as the network counts it. */
export function networkLength(network: Network, text: string): number {
  if (network !== 'x') return [...text].length
  let links = 0
  const rest = text.replace(URL_RE, () => { links++; return '' })
  return [...rest].length + links * X_LINK_LENGTH
}

export type CaptionCheck = { errors: string[]; warnings: string[] }

/** Errors block Schedule for that network; warnings do not. */
export function validateCaption(network: Network, text: string, limits: TextLimits, label: string): CaptionCheck {
  const errors: string[] = []
  const warnings: string[] = []
  if (!text.trim()) errors.push(`${label}: the caption is empty.`)
  const len = networkLength(network, text)
  if (len > limits.maxChars) errors.push(`${label}: the caption is ${len - limits.maxChars} characters too long (limit ${limits.maxChars}).`)
  else if (len > limits.maxChars * 0.9) warnings.push(`${label}: the caption is close to the ${limits.maxChars} character limit.`)
  const tagCount = (text.match(/(^|\s)#[A-Za-z0-9_]+/g) ?? []).length
  if (tagCount > limits.maxHashtags) errors.push(`${label}: ${tagCount} hashtags, but it takes ${limits.maxHashtags}.`)
  return { errors, warnings }
}
