import type { Payload } from 'payload'
import { audienceJson, DEFAULT_AUDIENCE } from '../../lib/email/audience'
import { emailHash } from '../../lib/email/unsub-token'

const CTX = { disableRevalidate: true } as const

/**
 * Demo bulk email (wave D WP-6): one draft campaign and a few do-not-email entries, so the Email page has something to show. It never
 * sends anything and does not need a mail provider; the Email module itself stays hidden until `EMAIL_PROVIDER` is set. Written only
 * while there are no campaigns and no suppressions. Two members with an address are marked unsubscribed (so a first send to the demo
 * audience visibly skips them), plus one address that belongs to nobody. Invented text and `example.org` addresses only.
 */
export async function seedDemoEmail(payload: Payload): Promise<string> {
  const campaigns = (await payload.count({ collection: 'email-campaigns', overrideAccess: true })).totalDocs
  const suppressions = (await payload.count({ collection: 'email-suppressions', overrideAccess: true })).totalDocs
  if (campaigns > 0 || suppressions > 0) return 'already present, skipped'

  await payload.create({
    collection: 'email-campaigns',
    data: {
      subject: 'Season starts soon, {firstName|there}',
      body: [
        'Hi {firstName|there},',
        'The new season at {clubName} is nearly here. Please check your details are up to date and let us know when you can help on a game day.',
        'You can say which game days suit you on your own page: {volunteerLink}',
        'Thank you for your support.',
      ].join('\n\n'),
      audience: audienceJson(DEFAULT_AUDIENCE),
    } as never,
    overrideAccess: true,
    context: CTX,
    depth: 0,
  })

  const withEmail = await payload.find({ collection: 'members', where: { and: [{ email: { exists: true } }, { status: { equals: 'active' } }] }, sort: 'id', limit: 2, depth: 0, overrideAccess: true })
  const rows = [
    ...(withEmail.docs as unknown as { email: string }[]).map((m) => ({ email: m.email, reason: 'unsubscribed' as const, source: 'demo' })),
    { email: 'former.supporter@example.org', reason: 'manual' as const, source: 'demo' },
  ]
  for (const r of rows) {
    await payload.create({ collection: 'email-suppressions', data: { emailHash: emailHash(r.email), email: r.email.toLowerCase(), reason: r.reason, source: r.source, at: new Date().toISOString() } as never, overrideAccess: true, context: CTX, depth: 0 })
  }
  return `1 draft campaign and ${rows.length} do-not-email entries`
}
