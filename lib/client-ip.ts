/**
 * The caller's address, as a soft signal only. Trusts, in order:
 * - on Vercel, `x-vercel-forwarded-for` (or `x-real-ip`);
 * - anywhere else, ONLY the header named by the `TRUSTED_IP_HEADER` env var (for example `cf-connecting-ip` or `x-real-ip`), which
 *   the club's own reverse proxy must set or overwrite on every request. Never name `x-forwarded-for` unless the proxy replaces it
 *   rather than appends to it: a client-supplied hop would bypass a cap or poison a victim's bucket.
 * With neither, there is no IP at all and callers skip the IP key (see `ipSourceConfigured` for the startup warning).
 */
export function clientIp(headers: Pick<Headers, 'get'>, env: Record<string, string | undefined> = process.env): string | null {
  let raw: string | null | undefined
  if (env.VERCEL) raw = headers.get('x-vercel-forwarded-for') ?? headers.get('x-real-ip')
  else if (env.TRUSTED_IP_HEADER?.trim()) raw = headers.get(env.TRUSTED_IP_HEADER.trim().toLowerCase())
  const first = raw?.split(',')[0]?.trim()
  return first && first.length <= 64 ? first : null
}

/** Is there any trusted source for the caller's address? False means every per-IP cap is silently off. */
export const ipSourceConfigured = (env: Record<string, string | undefined> = process.env): boolean => Boolean(env.VERCEL || env.TRUSTED_IP_HEADER?.trim())
