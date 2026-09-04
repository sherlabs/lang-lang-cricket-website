// Stub client for the PlayHQ External API (https://docs.playhq.com/tech).
// Not wired into any page yet — PLAYHQ_CLIENT_ID/SECRET are blank until
// PlayHQ grants data-partner access (requested via help@playhq.com).
// Swapping the fixtures page (app/fixtures/page.tsx) from manual DB data
// to this client is the only change needed once credentials exist.

export async function getPlayHQAccessToken(): Promise<string> {
  const res = await fetch('https://api.playhq.com/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: process.env.PLAYHQ_CLIENT_ID,
      clientSecret: process.env.PLAYHQ_CLIENT_SECRET,
    }),
  })
  if (!res.ok) throw new Error(`PlayHQ auth failed: ${res.status}`)
  const data = (await res.json()) as { access_token: string; exp: number }
  return data.access_token
}
