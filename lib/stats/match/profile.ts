import { matchCountsOf } from './counts'
import { coverageCaption, coverageOf } from './coverage'
import { batterDismissals, bowlerDismissals, type BatterDismissals, type BowlerDismissals } from './dismissals'
import { matchMilestonesFor, type MatchMilestone } from './milestones'
import type { MatchMinimums } from './minimums'
import { oppositionTable, type OppositionPlayerRow } from './opposition'
import { partnershipsForPlayer, unavailableText } from './partnerships'
import { positionSummary, type PositionSummary } from './position'
import { PARTNERSHIP_REASONS, inningsKey, type FactSet, type MatchCounts, type PartnershipReason } from './types'

/**
 * The "Match analysis" view model of one player's profile (W2 spec 4.2). Pure: the page passes the
 * player's own slice of the visible fact set, the club's partnership list and the visible names. A
 * section is `null` when the player has no rows for it, so the page omits it.
 */
export type PartnerLine = { key: string; partnerName: string; partnerSlug: string | null; runs: number; wicket: number; unbroken: boolean; date: string | null; grade: string | null }
export type ProfilePartnerships = {
  top: PartnerLine[]
  /** Pairs whose partner is hidden or unresolved: an anonymous count and best only (no date, grade or wicket). */
  others: { count: number; best: number }
  /** Best partner by runs, only with `partnershipPairGames` shared stands. */
  bestPartner: { name: string; slug: string | null; stands: number; runs: number } | null
  /** Caption detail: innings the player batted in with and without derivable partnerships. */
  inningsTotal: number
  inningsAvailable: number
  unavailable: string | null
}

export type ProfileMatchView = {
  counts: MatchCounts
  /** First sentence of every caption: "From <date>, N games stored." */
  base: string
  opposition: OppositionPlayerRow[]
  dismissals: { batter: BatterDismissals; caption: string } | null
  wickets: { bowler: BowlerDismissals; caption: string } | null
  partnerships: ProfilePartnerships | null
  position: { summary: PositionSummary; caption: string } | null
  milestones: MatchMilestone[]
}

export type PlayerRef = { name: string; slug: string | null }
const TOP_PARTNERSHIPS = 8

export function buildProfileMatchView(o: {
  player: FactSet
  /** Every club partnership of the same seasons (visible partners are `number`, hidden are `null`). */
  partnerships: FactSet['partnerships']
  playerId: number
  names: ReadonlyMap<number, PlayerRef>
  minimums: MatchMinimums
  /** Shown name for a canonical grade label. */
  gradeLabel?: (raw: string | null) => string | null
}): ProfileMatchView | null {
  const set = o.player
  if (set.appearances.length === 0) return null
  const counts = matchCountsOf(set)
  const base = coverageCaption(coverageOf(set))
  const label = o.gradeLabel ?? ((g: string | null) => g)

  const dismissals = counts.battingInnings > 0
    ? (() => {
        const batter = batterDismissals(counts, o.minimums)
        return { batter, caption: `${base} ${batter.recorded} of ${batter.outs} dismissals have a recorded type.` }
      })()
    : null
  const wickets = counts.wicketTakingInnings > 0
    ? (() => {
        const bowler = bowlerDismissals(counts)
        return { bowler, caption: `${base} ${bowler.reconciled} of ${bowler.wicketTakingInnings} wicket-taking innings reconcile with the scorecard.` }
      })()
    : null

  let partnerships: ProfilePartnerships | null = null
  if (counts.battingInnings > 0) {
    const view = partnershipsForPlayer(o.partnerships, o.playerId)
    const mine = new Set(set.bat.map((b) => inningsKey(b.m, b.seq)))
    const reasons: Partial<Record<PartnershipReason, number>> = {}
    let available = 0
    for (const k of mine) {
      const st = set.innings.get(k)?.partnerships
      if (st === 'ok') available++
      else if (st) reasons[st] = (reasons[st] ?? 0) + 1
    }
    const nameOf = (id: number): PlayerRef => o.names.get(id) ?? { name: 'a club player', slug: null }
    const top = [...view.withVisible]
      .sort((a, b) => b.runs - a.runs || b.wicket - a.wicket)
      .slice(0, TOP_PARTNERSHIPS)
      .map<PartnerLine>((p) => {
        const h = set.matches.get(p.m)
        const partner = nameOf(p.partner)
        return { key: `${p.m}-${p.seq}-${p.wicket}`, partnerName: partner.name, partnerSlug: partner.slug, runs: p.runs, wicket: p.wicket, unbroken: p.unbroken, date: h?.date ?? null, grade: h ? label(h.grade) : null }
      })
    const best = view.byPartner.find((p) => p.stands >= o.minimums.partnershipPairGames)
    const bestRef = best ? nameOf(best.partner) : null
    if (top.length > 0 || view.others.count > 0 || mine.size > 0) {
      partnerships = {
        top, others: view.others,
        bestPartner: best && bestRef ? { name: bestRef.name, slug: bestRef.slug, stands: best.stands, runs: best.runs } : null,
        inningsTotal: mine.size, inningsAvailable: available, unavailable: unavailableText(reasons, mine.size),
      }
    }
  }

  const position = counts.battingInnings > 0
    ? (() => {
        const summary = positionSummary(set.bat, o.minimums)
        return { summary, caption: `${base} Positions are as scored (the scorer's card order).${summary.excluded ? ` ${summary.excluded} innings with no recorded position are left out.` : ''}` }
      })()
    : null

  return {
    counts, base,
    opposition: oppositionTable(set, o.minimums),
    dismissals, wickets, partnerships, position,
    milestones: matchMilestonesFor(counts),
  }
}

export { PARTNERSHIP_REASONS }
