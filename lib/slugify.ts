export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'story'
}

// Slugs that collide with static routes under /history/*. Treated as always
// "taken" so makeUniqueSlug appends -2 the same way it does for a real
// collision, otherwise the story would be unreachable (the static route
// always wins the match).
const RESERVED_SLUGS = new Set(['submit', 'drafts'])

/** Appends -2, -3, ... to the base slug until `isTaken` reports one that's free. */
export async function makeUniqueSlug(
  title: string,
  isTaken: (slug: string) => Promise<boolean>
): Promise<string> {
  const base = slugify(title)
  const baseIsTaken = async (slug: string) => RESERVED_SLUGS.has(slug) || (await isTaken(slug))
  let slug = base
  let n = 2
  while (await baseIsTaken(slug)) {
    slug = `${base}-${n}`
    n += 1
  }
  return slug
}
