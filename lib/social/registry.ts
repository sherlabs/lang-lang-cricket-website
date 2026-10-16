import 'server-only'
import { SPECS } from './specs'
import { eventChoices, loadEvent, loadSponsors, sponsorChoices } from './sources/content'
import { loadPotm, loadResult, potmGames, potmPlayers, resultChoices } from './sources/result'
import { fixturesChoices, lineupChoices, loadFixtures, loadLineup } from './sources/schedule'
import { loadToss, tossChoices } from './sources/toss'
import { leadersChoices, loadLeaders, loadMilestone, loadSeasonWrap, milestoneChoices, seasonWrapChoices } from './sources/stats'
import { isGameId, type GraphicSpec, type GraphicType, type RawParams, type SourceList } from './types'

/**
 * Every graphic type: its pure spec plus the server half (the chooser list and the data loader). Each `load` states its own
 * visibility rules and returns null for anything it will not draw; the route turns null into the same 404 as an unknown id.
 */
type Graphic = { spec: GraphicSpec; choices(extra: RawParams): Promise<SourceList>; load(params: never): Promise<unknown | null> }

export const GRAPHICS: Record<GraphicType, Graphic> = {
  result: { spec: SPECS.result, choices: () => resultChoices(), load: loadResult as Graphic['load'] },
  fixtures: { spec: SPECS.fixtures, choices: () => fixturesChoices(), load: loadFixtures as Graphic['load'] },
  lineup: { spec: SPECS.lineup, choices: () => lineupChoices(), load: loadLineup as Graphic['load'] },
  potm: { spec: SPECS.potm, choices: (x) => (isGameId(x.game) ? potmPlayers(x.game) : potmGames()), load: loadPotm as Graphic['load'] },
  milestone: { spec: SPECS.milestone, choices: () => milestoneChoices(), load: loadMilestone as Graphic['load'] },
  'stats-leaders': { spec: SPECS['stats-leaders'], choices: () => leadersChoices(), load: loadLeaders as Graphic['load'] },
  'event-promo': { spec: SPECS['event-promo'], choices: () => eventChoices(), load: loadEvent as Graphic['load'] },
  'sponsor-thanks': { spec: SPECS['sponsor-thanks'], choices: () => sponsorChoices(), load: loadSponsors as Graphic['load'] },
  'season-wrap': { spec: SPECS['season-wrap'], choices: () => seasonWrapChoices(), load: loadSeasonWrap as Graphic['load'] },
  toss: { spec: SPECS.toss, choices: () => tossChoices(), load: loadToss as Graphic['load'] },
}
