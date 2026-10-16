import 'server-only'
import type { Payload, PayloadRequest } from 'payload'
import type { AuditEntry } from './audit'

/** Writes one audit row. Called by server code only, after its own staff or admin check; the collection has no write access for anyone. */
export async function writeAudit(payload: Payload, entry: AuditEntry, req?: Partial<PayloadRequest>): Promise<void> {
  await payload.create({
    collection: 'office-audit-log',
    data: {
      user: entry.userId,
      action: entry.action,
      module: entry.module,
      summary: entry.summary,
      rowCount: entry.rowCount,
      includedSensitive: entry.includedSensitive,
      at: new Date().toISOString(),
    },
    overrideAccess: true,
    depth: 0,
    ...(req ? { req: req as PayloadRequest } : {}),
  })
}
