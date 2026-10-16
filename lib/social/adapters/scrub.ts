import { SECRET_ENV_KEYS } from './stubs'
import type { SocialEnv } from './types'

/**
 * Removes every configured secret value (plain and URL-encoded) from a string before it is stored or logged. Adapter errors can
 * echo request bodies or headers, so nothing from a network is trusted to be clean. Very short values are ignored (they would
 * blank out ordinary words).
 */
export function scrubSecrets(text: string, env: SocialEnv = process.env): string {
  let out = text
  for (const key of SECRET_ENV_KEYS) {
    const v = env[key]?.trim()
    if (!v || v.length < 4) continue
    for (const form of new Set([v, encodeURIComponent(v), encodeURI(v)])) out = out.split(form).join('[hidden]')
  }
  return out
}

/** The text kept on a target: scrubbed, flattened to one line and cut at 300 characters. */
export const storedReason = (text: string, env: SocialEnv = process.env): string => scrubSecrets(text, env).replace(/\s+/g, ' ').trim().slice(0, 300)
