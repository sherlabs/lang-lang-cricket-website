import type { EmailAdapter, EmailMessage, SendFailureKind, SendResult } from '../types'

/**
 * The mock adapter (tests and local development; refused on Vercel by `assertSafeEnv`). Records every message in memory, can be told
 * to fail the next sends, can hold a send open (to prove a caller did not wait for it), and prints a readable dump to the server console
 * unless told to be quiet. The state lives on `globalThis` so the admin pages, the route handlers and the tests share one outbox even when
 * the bundler gives each its own copy of this module.
 */
type Scripted = { kind: SendFailureKind; message: string }
type MockState = { sent: EmailMessage[]; calls: number; script: Scripted[]; ids: Map<string, string>; hold: Promise<void> | null; quiet: boolean }

const KEY = Symbol.for('club.email.mock')
const state = (): MockState => {
  const g = globalThis as unknown as Record<symbol, MockState | undefined>
  return (g[KEY] ??= { sent: [], calls: 0, script: [], ids: new Map(), hold: null, quiet: Boolean(process.env.VITEST) })
}

export const mockMail = {
  /** Messages accepted so far, oldest first. */
  sent: (): readonly EmailMessage[] => state().sent,
  /** How many times `send` was called (accepted or not). */
  calls: (): number => state().calls,
  /** Clears the outbox, the script and any hold. */
  reset(): void {
    const s = state()
    s.sent = []
    s.calls = 0
    s.script = []
    s.ids = new Map()
    s.hold = null
  },
  /** The next sends fail in this order (then sends succeed again). */
  failNext(kind: SendFailureKind, times = 1, message = `mock ${kind} failure`): void {
    for (let i = 0; i < times; i++) state().script.push({ kind, message })
  },
  /** Holds every send open until the returned function is called. */
  hold(): () => void {
    let release!: () => void
    state().hold = new Promise<void>((r) => (release = r))
    return () => {
      state().hold = null
      release()
    }
  },
  quiet(on: boolean): void {
    state().quiet = on
  },
}

const dump = (m: EmailMessage, id: string): void => {
  const lines = [`[mock mail ${id}]`, `To: ${m.to}`, `From: ${m.from.name} <${m.from.address}>`, ...(m.replyTo ? [`Reply-To: ${m.replyTo}`] : []), `Subject: ${m.subject}`, ...Object.entries(m.headers ?? {}).map(([k, v]) => `${k}: ${v}`), '', m.text, '']
  console.log(lines.join('\n'))
}

export const mockAdapter: EmailAdapter = {
  id: 'mock',
  live: false,
  async send(message: EmailMessage): Promise<SendResult> {
    const s = state()
    s.calls += 1
    if (s.hold) await s.hold
    const next = s.script.shift()
    if (next) return { ok: false, kind: next.kind, message: next.message }
    // A provider returns the first answer again for a repeated idempotency key; so does the mock.
    const seen = message.idempotencyKey ? s.ids.get(message.idempotencyKey) : undefined
    if (seen) return { ok: true, providerId: seen }
    const id = `mock-${s.sent.length + 1}`
    s.sent.push(message)
    if (message.idempotencyKey) s.ids.set(message.idempotencyKey, id)
    if (!s.quiet) dump(message, id)
    return { ok: true, providerId: id }
  },
}
