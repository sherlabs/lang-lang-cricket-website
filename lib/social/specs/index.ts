import type { GraphicSpec, GraphicType } from '../types'
import { eventPromoSpec } from './event-promo'
import { fixturesSpec } from './fixtures'
import { lineupSpec } from './lineup'
import { milestoneSpec } from './milestone'
import { potmSpec } from './potm'
import { resultSpec } from './result'
import { seasonWrapSpec } from './season-wrap'
import { sponsorThanksSpec } from './sponsor-thanks'
import { leadersSpec } from './stats-leaders'
import { tossSpec } from './toss'

/** The pure half of every graphic type. Loading the data for each is in `lib/social/sources`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SPECS: { [K in GraphicType]: GraphicSpec<any, any> } = {
  result: resultSpec,
  fixtures: fixturesSpec,
  lineup: lineupSpec,
  potm: potmSpec,
  milestone: milestoneSpec,
  'stats-leaders': leadersSpec,
  'event-promo': eventPromoSpec,
  'sponsor-thanks': sponsorThanksSpec,
  'season-wrap': seasonWrapSpec,
  toss: tossSpec,
}
