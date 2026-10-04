/**
 * Opposition identity (W2 spec 2.6). PlayHQ organisation ids are stable, so the name fallback exists
 * only for matches without one (imported history). The normalisation is locale-neutral: case-fold,
 * trim, collapse whitespace and drop punctuation. It strips no words ("club", "cc") and no grade
 * suffixes, so two different clubs are never merged. An `n:` key never equals an org-id key; an
 * admin mapping (a later work package) is what joins imported names to PlayHQ organisations.
 */
export function normaliseClubName(raw: string | null | undefined): string {
  return (raw ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export type OppositionRef = { opponentOrgId: string | null; opponentOrgName: string | null; opponentName: string | null }

export function oppositionKey(m: OppositionRef): string {
  if (m.opponentOrgId) return m.opponentOrgId
  const name = normaliseClubName(m.opponentOrgName ?? m.opponentName)
  return `n:${name.replace(/ /g, '-') || 'unknown'}`
}

/** The label shown for an opposition: the organisation name, else the team name. */
export const oppositionLabel = (m: OppositionRef): string => m.opponentOrgName?.trim() || m.opponentName?.trim() || 'Unknown opposition'
