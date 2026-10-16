/** The mail seam (wave D spec 9.1). Everything that sends mail goes through an `EmailAdapter`; nothing else talks to a provider. */
export type EmailMessage = {
  to: string
  from: { name: string; address: string }
  replyTo?: string
  subject: string
  html: string
  text: string
  headers?: Record<string, string>
  idempotencyKey?: string
}

export type SendFailureKind = 'rate' | 'transient' | 'permanent' | 'auth'
export type SendResult = { ok: true; providerId: string } | { ok: false; kind: SendFailureKind; message: string }

export interface EmailAdapter {
  id: string
  /** True for a real provider. The mock is never live. */
  live: boolean
  send(message: EmailMessage): Promise<SendResult>
}
