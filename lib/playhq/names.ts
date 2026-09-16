function titleCase(s: string) {
  return s.trim().toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (m) => m.toUpperCase())
}

export function displayName(p: { firstName: string; lastName: string }, isJunior: boolean): string {
  const first = titleCase(p.firstName ?? '')
  const last = titleCase(p.lastName ?? '')
  if (!last) return first
  return isJunior ? `${first} ${last[0]}.` : `${first} ${last}`
}
