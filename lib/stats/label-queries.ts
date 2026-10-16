import 'server-only'
import { sql } from '@payloadcms/db-postgres/drizzle'
import { unstable_cache } from 'next/cache'
import type { Payload } from 'payload'
import { MATCH_SCHEMA } from '@/lib/match-store/db'
import { getPayloadClient } from '@/lib/payload/client'
import { getStatsSettings } from '@/lib/site-settings'
import { buildLabelMap, type LabelKind, type LabelMap } from './labels'
import { ALL_STATS_TAGS } from './tags'

/**
 * The one label map every stats read goes through (W2 spec 6.3): the grade and team spellings that exist in the season rows
 * and the stored matches, with their counts, plus the admin's `site-settings.stats.labelRenames`. Stored rows are never rewritten
 * (the sync replaces them every night); the map is applied when reading. Labels only: no person is read here.
 */
export type LabelSample = { kind: LabelKind; label: string; count: number }

/** Distinct grade and team labels with how many rows use them, across season rows and stored matches. */
export async function loadLabelSamples(payload: Payload): Promise<LabelSample[]> {
  const q = (kind: string, table: string, col: string) => `SELECT '${kind}' AS kind, "${col}" AS label, COUNT(*)::int AS n FROM "${MATCH_SCHEMA}"."${table}" WHERE "${col}" IS NOT NULL AND "${col}" <> '' GROUP BY "${col}"`
  const res = await payload.db.drizzle.execute(
    sql.raw([q('grade', 'player_seasons', 'grade_name'), q('team', 'player_seasons', 'team_name'), q('grade', 'matches', 'grade_name'), q('team', 'matches', 'club_team_name')].join(' UNION ALL ')),
  )
  const rows = ((res as unknown as { rows?: { kind: LabelKind; label: string; n: number }[] }).rows ?? [])
  return rows.map((r) => ({ kind: r.kind, label: String(r.label), count: Number(r.n) }))
}

async function load(): Promise<LabelSample[]> {
  return loadLabelSamples(await getPayloadClient())
}

async function cachedSamples(): Promise<LabelSample[]> {
  try {
    return await unstable_cache(load, ['label-samples', 'v1'], { tags: [...ALL_STATS_TAGS], revalidate: 3600 })()
  } catch (err) {
    if (err instanceof Error && /incrementalCache missing/.test(err.message)) return load()
    throw err
  }
}

/** The label map for this request: cached samples (stats tags) plus the current renames. */
export async function getLabelMap(): Promise<LabelMap> {
  const [samples, settings] = await Promise.all([cachedSamples(), getStatsSettings()])
  return buildLabelMap(samples, settings.labelRenames)
}
