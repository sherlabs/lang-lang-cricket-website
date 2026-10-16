import { isAdmin } from '../access'
import { internalCollection, text } from './internalCollection'

/**
 * Replay log for the shared sign-in broker (wave F spec 3.2): one row per broker assertion id (`jti`) that has been used, so the
 * same 60 second assertion cannot sign in twice. No personal data. Written by `consumeJti` in one atomic `INSERT ... ON CONFLICT
 * DO NOTHING` and swept after a day by the nightly cron. Admin-readable, never writable through REST. Broker events do not use it
 * (unlinking is idempotent, so a redelivered event is harmless).
 */
export const AuthBrokerJtis = internalCollection({
  slug: 'auth-broker-jtis',
  singular: 'Sign-in assertion record',
  plural: 'Sign-in assertion records (data)',
  description: 'Remembers which one-time sign-in tokens from the shared broker were used. Written by the site; read only.',
  defaultColumns: ['jti', 'expiresAt'],
  read: isAdmin,
  fields: [text('jti', { required: true, unique: true, index: true }), { name: 'expiresAt', type: 'date', required: true, index: true }],
})
