import type { EtlContext } from '../media'

/** One ETL step (spec §12.2). Each is idempotent; order is fixed by foreign keys. */
export type EtlStep = {
  name: string
  run(ctx: EtlContext): Promise<void>
}
