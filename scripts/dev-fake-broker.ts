/**
 * A fake shared sign-in broker for trying Facebook sign-in by hand, with no Facebook and no network (wave F spec 3.6).
 *
 *   pnpm dev:fake-broker                                # listens on 127.0.0.1:4455
 *   AUTH_BROKER_ORIGIN=http://127.0.0.1:4455 AUTH_BROKER_CLUB_ID=demo-club NEXT_PUBLIC_SERVER_URL=http://localhost:4400 pnpm dev -p 4400
 *
 * It binds to 127.0.0.1 only and refuses any port outside 4400-4499. Open the selector login page, press Continue with Facebook,
 * type a pretend Facebook id on the page that appears, and you are sent back signed in (or told the invite is needed). The page
 * `/event` posts a signed data-deletion event to the site's events address.
 */
import { createServer } from 'node:http'
import { createFakeBroker } from '../tests/helpers/fake-broker'

const HOST = '127.0.0.1'
const port = Number(process.env.FAKE_BROKER_PORT ?? 4455)
if (!Number.isInteger(port) || port < 4400 || port > 4499) {
  console.error('[fake-broker] FAKE_BROKER_PORT must be in 4400-4499')
  process.exit(1)
}
const clubId = process.env.AUTH_BROKER_CLUB_ID?.trim() || 'demo-club'
const ownOrigin = (process.env.FAKE_BROKER_SITE?.trim() || process.env.NEXT_PUBLIC_SERVER_URL?.trim() || 'http://localhost:3000').replace(/\/+$/, '')
const origin = `http://${HOST}:${port}`

const broker = await createFakeBroker({ origin, clubId, ownOrigin })
const page = (body: string) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fake broker</title><body style="font-family:system-ui;max-width:28rem;margin:2rem auto;padding:0 1rem">${body}`
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', origin)
  const send = (status: number, body: string, type = 'text/html; charset=utf-8', headers: Record<string, string> = {}) => {
    res.writeHead(status, { 'Content-Type': type, ...headers })
    res.end(body)
  }
  if (url.pathname === '/healthz') return send(200, JSON.stringify({ ok: true, facebookConfigured: true, clubs: 1, keys: broker.keys.length }), 'application/json')
  if (url.pathname === '/.well-known/jwks.json') return send(200, JSON.stringify({ keys: broker.keys.map((k) => k.jwk) }), 'application/json')
  if (url.pathname === '/v1/facebook/start') {
    const returnTo = url.searchParams.get('return_to') ?? ''
    if (url.searchParams.get('club') !== clubId || !returnTo.startsWith(`${ownOrigin}/`)) return send(400, 'club or return_to not registered')
    // The real broker would now send the person to Facebook. This one asks which pretend person they are.
    const keep = ['club', 'return_to', 'nonce', 'state'].map((k) => `<input type="hidden" name="${k}" value="${esc(url.searchParams.get(k) ?? '')}">`).join('')
    return send(200, page(`<h1>Pretend Facebook</h1><form method="get" action="/v1/facebook/finish">${keep}<label>Facebook id (digits)<br><input name="sub" value="100000000000001" inputmode="numeric" style="font-size:1rem;padding:.5rem;width:100%"></label><p><button style="font-size:1rem;padding:.6rem 1rem">Continue</button> <button name="deny" value="1" style="font-size:1rem;padding:.6rem 1rem">Cancel</button></p></form>`))
  }
  if (url.pathname === '/v1/facebook/finish') {
    const returnTo = new URL(url.searchParams.get('return_to') ?? '')
    const state = url.searchParams.get('state') ?? ''
    if (url.searchParams.get('deny')) returnTo.searchParams.set('websport_error', 'denied')
    else returnTo.searchParams.set('websport_assertion', await broker.assertion({ sub: url.searchParams.get('sub') ?? '', nonce: url.searchParams.get('nonce') ?? '' }))
    returnTo.searchParams.set('state', state)
    return send(303, '', 'text/plain', { Location: returnTo.toString() })
  }
  if (url.pathname === '/event') {
    const sub = url.searchParams.get('sub') ?? ''
    if (!sub) return send(200, page(`<h1>Send an event</h1><form><label>Facebook id <input name="sub"></label> <button>Send data deletion</button></form>`))
    const r = await fetch(`${ownOrigin}/api/websport-auth/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: await broker.event({ sub }) }) })
    return send(200, page(`<p>The site answered ${r.status}.</p>`))
  }
  return send(404, 'not found', 'text/plain')
}).listen(port, HOST, () => console.log(`[fake-broker] ${origin} for club "${clubId}", site ${ownOrigin}`))
