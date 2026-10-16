/**
 * Test-only stand-ins for a slow or failing session lookup (wave G WP-0). Slowness is simulated here and nowhere else: no shipped
 * code reads a delay from the environment (`tests/admin-no-test-hooks.test.ts` enforces that).
 */
export const slowFindByID = (ms: number, doc: unknown) => () => new Promise((resolve) => setTimeout(() => resolve(doc), ms))
export const failingFindByID = (message = 'connection terminated due to connection timeout') => () => Promise.reject(new Error(message))
