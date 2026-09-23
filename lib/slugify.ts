export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'story'
}

/** Appends -2, -3, ... to the base slug until `isTaken` reports one that's free. */
export async function makeUniqueSlug(
  title: string,
  isTaken: (slug: string) => Promise<boolean>
): Promise<string> {
  const base = slugify(title)
  let slug = base
  let n = 2
  while (await isTaken(slug)) {
    slug = `${base}-${n}`
    n += 1
  }
  return slug
}
