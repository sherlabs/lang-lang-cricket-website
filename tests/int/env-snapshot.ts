/**
 * Snapshot/restore of a process.env-like object. Int files share one process, so an env var one
 * file sets (directly or via a stub that is never undone) used to reach every later file. The first
 * file's starting env is stored once; every file starts from exactly that.
 */
export type EnvLike = Record<string, string | undefined>

export function snapshotEnv(env: EnvLike): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(env)) if (v !== undefined) out[k] = v
  return out
}

/** Makes `env` equal `snapshot`; returns the names that were added, changed or removed. */
export function restoreEnv(env: EnvLike, snapshot: Record<string, string>): string[] {
  const touched: string[] = []
  for (const k of Object.keys(env)) {
    if (!(k in snapshot)) {
      delete env[k]
      touched.push(k)
    }
  }
  for (const [k, v] of Object.entries(snapshot)) {
    if (env[k] !== v) {
      env[k] = v
      touched.push(k)
    }
  }
  return touched
}
