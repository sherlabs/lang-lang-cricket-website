/**
 * The caller's address, as a soft signal only. Trusts `x-vercel-forwarded-for` (or `x-real-ip`) and ONLY when running on Vercel:
 * anywhere else the first `x-forwarded-for` hop is attacker-controlled and would bypass a cap or poison a victim's bucket, so
 * there is no IP at all (callers then skip the IP key).
 */
export function clientIp(headers: Pick<Headers, 'get'>, env: Record<string, string | undefined> = process.env): string | null {
  if (!env.VERCEL) return null
  const raw = headers.get('x-vercel-forwarded-for') ?? headers.get('x-real-ip')
  const first = raw?.split(',')[0]?.trim()
  return first && first.length <= 64 ? first : null
}
