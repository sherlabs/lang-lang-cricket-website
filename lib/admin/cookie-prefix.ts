/**
 * The one place the sign-in cookie prefix is named. `payload.config.ts` passes it to Payload (`cookiePrefix`) and the edge gate
 * (`lib/admin/edge-gate.ts`, run from `proxy.ts`) reads the `<prefix>-token` cookie by it, so the two cannot disagree. A club that
 * wants a different cookie name changes it here. No imports, so the proxy can use it.
 */
export const SESSION_COOKIE_PREFIX = 'payload'
