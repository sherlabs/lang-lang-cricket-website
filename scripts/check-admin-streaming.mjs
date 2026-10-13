/**
 * Acceptance check for wave G WP-0 (run against `next build` + `next start`, never `next dev`):
 *   BASE=http://localhost:4501 ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/check-admin-streaming.mjs
 * Signs in over REST, requests the Social deep link, reads the streamed body chunk by chunk and checks that the shell skeleton
 * and the page heading arrive before the queue region's content. Local use only: point BASE at a local server.
 */
const base = process.env.BASE ?? 'http://localhost:4501'
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) throw new Error('BASE must be a local server')
const login = await fetch(`${base}/api/users/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }) })
if (!login.ok) throw new Error(`login failed: ${login.status}`)
const cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
const started = performance.now()
const res = await fetch(`${base}/admin/social?type=sponsor-thanks&source=13%2C17&style=bold&size=landscape`, { headers: { cookie, 'sec-fetch-site': 'same-origin' } })
const reader = res.body.getReader()
const dec = new TextDecoder()
let text = ''
const seen = {}
const marks = { shell: 'data-admin-skeleton="shell"', heading: 'Social posts</h1>', queueSkeleton: 'data-admin-skeleton="queue"', queue: 'data-admin-region="queue"', composerSkeleton: 'data-admin-skeleton="composer"' }
let chunks = 0
for (;;) {
  const { done, value } = await reader.read()
  if (done) break
  chunks += 1
  text += dec.decode(value, { stream: true })
  for (const [k, m] of Object.entries(marks)) if (seen[k] === undefined && text.includes(m)) seen[k] = { chunk: chunks, ms: Math.round(performance.now() - started), at: text.indexOf(m) }
}
console.log(JSON.stringify({ status: res.status, chunks, seen }, null, 1))
const order = ['shell', 'heading'].every((k) => seen[k] !== undefined) && seen.shell.at < seen.heading.at
if (!order) { console.error('FAIL: shell skeleton must precede the page heading'); process.exit(1) }
if (seen.queue !== undefined && seen.queueSkeleton !== undefined && seen.queueSkeleton.at > seen.queue.at) { console.error('FAIL: queue skeleton must precede queue content'); process.exit(1) }
console.log('OK')
