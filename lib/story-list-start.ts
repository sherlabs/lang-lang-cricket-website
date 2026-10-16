/**
 * An `<ol start>` worth keeping (Tiptap writes one for a list begun with "3. "): a plain 2..9999,
 * else null (1 is the default). Pure, so the public renderer and the conversion pipeline share it.
 */
export function listStart(value: unknown): number | null {
  const s = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : ''
  if (!/^\d{1,4}$/.test(s)) return null
  const n = Number(s)
  return n > 1 ? n : null
}
