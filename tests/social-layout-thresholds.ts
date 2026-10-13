import before from './fixtures/social-layout-before.json'

/**
 * The maximum share of the content box a picture may leave empty, per case x size x style (wave G spec WP-2b). Not one number:
 * each cell's "before" column is what the previous renderer measured (`fixtures/social-layout-before.json`, taken before any
 * layout change), and the target is the lower of 25 percent and 60 percent of that, rounded up to a whole percent.
 * A cell whose target cannot be met without breaking another rule is listed in `EXCEPTIONS` with the reason and its own ceiling.
 */
export const FLAGGED_CASES = ['sponsor-thanks', 'result', 'stats-leaders'] as const
export const TARGET_RULE = (beforeUnused: number): number => Math.ceil(Math.min(25, 0.6 * beforeUnused * 100)) / 100

export const EXCEPTIONS: Record<string, { ceiling: number; reason: string }> = {
  'result-single|landscape|classic': {
    ceiling: 0.04,
    reason: 'The wide classic page was already at 3 percent before; 60 percent of that is 2 percent, which is inside the noise of the bounding-box measure (a letter more or less in the date line).',
  },
}

export type Threshold = { key: string; before: number; target: number; ceiling: number; exception?: string }

export function thresholds(): Threshold[] {
  return Object.entries(before as Record<string, { unused: number }>)
    .filter(([key]) => FLAGGED_CASES.some((c) => key.startsWith(c)))
    .map(([key, v]) => {
      const target = TARGET_RULE(v.unused)
      const ex = EXCEPTIONS[key]
      return { key, before: v.unused, target, ceiling: ex ? ex.ceiling : target, ...(ex ? { exception: ex.reason } : {}) }
    })
}
