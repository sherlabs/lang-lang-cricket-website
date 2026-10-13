/**
 * Argument handling of `pnpm bootstrap:club` (pure, unit tested). Dry run is the default: `--confirm` is what allows a write. The
 * database target is checked like every operator script: `--target` must equal `DATABASE_URI`, and a remote host needs `ALLOW_REMOTE_DB=yes`.
 */
import { argValue, checkGuard, type GuardResult } from '../scripts/_guard'

export type BootstrapArgs = {
  profilePath: string
  confirm: boolean
  force: boolean
  skipAdmin: boolean
  skipAssets: boolean
  guard: GuardResult
}

export function parseBootstrapArgs(argv: readonly string[], env: Record<string, string | undefined> = process.env): BootstrapArgs {
  const profilePath = argValue(argv, '--profile')
  if (!profilePath) throw new Error('[bootstrap] pass --profile clubs/<slug>/profile.json')
  const confirm = argv.includes('--confirm')
  // A dry run reads only; the guard still insists on the right target so a typo never reads the wrong database.
  const guard = checkGuard({ write: confirm }, argv, env)
  return { profilePath, confirm, force: argv.includes('--force'), skipAdmin: argv.includes('--skip-admin'), skipAssets: argv.includes('--skip-assets'), guard }
}
