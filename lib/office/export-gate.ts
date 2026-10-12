/**
 * Same-origin check for office POSTs (exports, quick-add, erase). A browser form post carries `Origin`; a request without one must
 * say `Sec-Fetch-Site: same-origin`. A foreign `Origin` is always refused. Pure, so the rule is unit-tested.
 */
export function exportOriginOk(i: { origin: string | null; secFetchSite: string | null; csrf: readonly string[] }): boolean {
  if (i.origin) return i.csrf.includes(i.origin)
  return i.secFetchSite === 'same-origin'
}
