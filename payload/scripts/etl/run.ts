/**
 * The ETL proper, minus the CLI (etl-legacy.ts): `--reconcile-deletes` first (children first),
 * then the steps in the §12.2 order. Reconciling first means a stale target row never holds a
 * unique key (slug, token, nameKey, filename) that legacy has since given to another id, which
 * would make that row's import fail on the first run.
 */
import type { EtlContext } from './media'
import { reconcileDeletes } from './reconcile'
import { ETL_STEPS } from './steps'

export async function runEtl(ctx: EtlContext, opts: { only?: readonly string[]; reconcile?: boolean; log?: (msg: string) => void } = {}): Promise<void> {
  const { only, reconcile, log = () => {} } = opts
  const verb = ctx.dryRun ? 'planning' : 'running'
  if (reconcile) {
    log(`[etl] ${verb} reconcile-deletes`)
    await reconcileDeletes(ctx, only)
  }
  for (const step of ETL_STEPS) {
    if (only && !only.includes(step.name)) continue
    log(`[etl] ${verb} ${step.name}`)
    await step.run(ctx)
  }
}
