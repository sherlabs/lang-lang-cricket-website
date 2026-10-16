import type { EmailAdapter, EmailMessage, SendResult } from '../types'

const ENDPOINT = 'https://api.resend.com/emails'

/** Maps an HTTP status to what the sender should do next. */
export function classifyStatus(status: number): 'rate' | 'transient' | 'permanent' | 'auth' {
  if (status === 429) return 'rate'
  if (status === 401 || status === 403) return 'auth'
  if (status >= 500 || status === 408 || status === 409) return 'transient'
  return 'permanent'
}

/** Resend over its plain HTTP API (no SDK, no new dependency). The idempotency key makes a retried send safe. */
export function createResendAdapter(apiKey: string, fetchImpl: typeof fetch = fetch): EmailAdapter {
  return {
    id: 'resend',
    live: true,
    async send(m: EmailMessage): Promise<SendResult> {
      const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
      if (m.idempotencyKey) headers['Idempotency-Key'] = m.idempotencyKey
      let res: Response
      try {
        res = await fetchImpl(ENDPOINT, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            from: `${m.from.name} <${m.from.address}>`,
            to: [m.to],
            ...(m.replyTo ? { reply_to: m.replyTo } : {}),
            subject: m.subject,
            html: m.html,
            text: m.text,
            ...(m.headers ? { headers: m.headers } : {}),
          }),
          signal: AbortSignal.timeout(15_000),
        })
      } catch (err) {
        return { ok: false, kind: 'transient', message: err instanceof Error ? err.message : 'network error' }
      }
      const body = (await res.json().catch(() => null)) as { id?: unknown; message?: unknown } | null
      if (res.ok && body && typeof body.id === 'string') return { ok: true, providerId: body.id }
      return { ok: false, kind: res.ok ? 'transient' : classifyStatus(res.status), message: typeof body?.message === 'string' ? body.message.slice(0, 200) : `HTTP ${res.status}` }
    },
  }
}
