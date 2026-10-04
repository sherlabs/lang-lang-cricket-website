import { ALL_STATS_TAGS } from '@/lib/stats/tags'
import { revalidatePaths } from '../../payload/hooks/revalidate'

/**
 * `/players`, every `/players/[slug]` page and the stats pages (tags `player-stats` and `match-store`). The legacy
 * `/history` call is dropped (nothing there reads players). `revalidatePaths` swallows the
 * errors Next throws outside a request (`payload run`, ETL, tests).
 */
export async function revalidatePlayerPages(): Promise<void> {
  await revalidatePaths(['/players', '/stats', '/records', '/honours', '/players/compare', '/stats/opposition', '/records/partnerships'], undefined, ALL_STATS_TAGS)
  try {
    const { revalidatePath } = await import('next/cache')
    revalidatePath('/players/[slug]', 'page')
  } catch {
    // outside a Next request (tests, `payload run`): nothing to revalidate
  }
}

/** `/players` and every `/players/[slug]` page, without the stats pages (a photo or sponsor change does not move stats). */
export async function revalidatePlayerProfiles(): Promise<void> {
  await revalidatePaths(['/players'])
  try {
    const { revalidatePath } = await import('next/cache')
    revalidatePath('/players/[slug]', 'page')
  } catch {
    // outside a Next request (tests, `payload run`): nothing to revalidate
  }
}
