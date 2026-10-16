/** Friendly filter chips for the admin lists (wave G WP-4): each chip is a set of Payload `where` query parameters. Pure. */
export type FilterChip = { key: string; label: string; params: Record<string, string> }

/** Every query key that belongs to a filter (Payload writes `where[...]`), so choosing a chip replaces the old filter and nothing else. */
export const isWhereKey = (k: string) => k === 'where' || k.startsWith('where[')

/** The address to go to for a chip: keeps search, sort and page size, drops the old filter and the page number. */
export function chipHref(base: string, current: URLSearchParams, chip: FilterChip | null): string {
  const next = new URLSearchParams()
  for (const [k, v] of current) if (!isWhereKey(k) && k !== 'page') next.append(k, v)
  if (chip) for (const [k, v] of Object.entries(chip.params)) next.set(k, v)
  const qs = next.toString()
  return qs ? `${base}?${qs}` : base
}

/** The chip that matches the address, or null (= "All"); a hand-built filter matches none and leaves nothing selected but "All" off. */
export function activeChip(current: URLSearchParams, chips: FilterChip[]): { chip: FilterChip | null; custom: boolean } {
  const where = [...current.keys()].filter(isWhereKey)
  if (where.length === 0) return { chip: null, custom: false }
  const hit = chips.find((c) => {
    const keys = Object.keys(c.params)
    return keys.length === where.length && keys.every((k) => current.get(k) === c.params[k])
  })
  return hit ? { chip: hit, custom: false } : { chip: null, custom: true }
}
