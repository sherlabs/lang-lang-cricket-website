/**
 * Runs before every int test file (vitest `setupFiles`). Files share one fork, one process
 * environment and Payload's `global._payload` cache, and a file's own cleanup runs only if its
 * `afterAll` gets that far: a teardown that times out (a loaded machine) or throws used to leave
 * `PAYLOAD_BLOB_FAKE` set, or a destroyed or differently configured Payload instance cached, for
 * whichever file ran next. That showed up as intermittent failures that pass alone: pages.int tried
 * a real Vercel Blob upload, and etl.int saw image/jpeg for image/png (a gallery photo written
 * through a leaked config took another path). Every file now starts from a clean slate, whatever
 * the previous one managed to clean up.
 */
for (const name of ['PAYLOAD_BLOB_FAKE', 'PAYLOAD_ETL']) delete process.env[name]
;(globalThis as { _payload?: Map<string, unknown> })._payload?.clear()
