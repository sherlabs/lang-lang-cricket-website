/**
 * Networks fetch the picture from a link on the club's own site, so that site must be a public https address (spec 4.1).
 * `http`, `localhost`, loopback and private addresses can never be fetched. For local acceptance runs a non-production override
 * exists: `SOCIAL_ALLOW_LOCAL_SITE_URL=yes`, honoured only when NODE_ENV is not production.
 */
function privateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '')
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || !h.includes('.') && !h.includes(':')) return true
  if (h === '::1' || h === '::' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80') || h.startsWith('::ffff:')) return h.includes(':')
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h)
  if (!m) return false
  const [a, b] = [Number(m[1]), Number(m[2])]
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224
}

export function isPublicHttpsUrl(url: string | null | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!url) return false
  if (env.SOCIAL_ALLOW_LOCAL_SITE_URL === 'yes' && env.NODE_ENV !== 'production') return /^https?:\/\//i.test(url)
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  return u.protocol === 'https:' && !u.username && !u.password && !privateHost(u.hostname)
}

export const SITE_URL_BLOCK = 'The site address is not a public https address, so networks cannot fetch the picture.'
