import { canonicalGrade, canonicalTeam, renameFor, type LabelMap } from '../labels'
import type { FactSet } from './types'

/**
 * Grade and team labels of every match header, tidied by the one label map (W2 6.3): admin renames win, otherwise the most
 * frequent spelling. Applied after the cached blob is decoded, so a rename shows at once and the stored rows never change.
 * An opponent rename maps the opposition's name or key to a target `oppositionKey`, which joins imported opponents to PlayHQ organisations.
 */
export function labelHeaders(set: FactSet, map: LabelMap): FactSet {
  for (const [id, h] of set.matches) {
    const oppTo = renameFor('opponent', h.oppLabel, map) ?? renameFor('opponent', h.oppKey, map)
    set.matches.set(id, { ...h, grade: h.grade ? canonicalGrade(h.grade, map) : h.grade, team: canonicalTeam(h.team, map), oppKey: oppTo ?? h.oppKey })
  }
  return set
}
