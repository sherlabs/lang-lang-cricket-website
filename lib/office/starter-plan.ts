import type { StarterPillar } from './diary'

/**
 * A generic starter strategic plan for "Add a starter plan" (wave D spec 7.2): five pillars with two or three example objectives
 * each, every one marked as an example for the club to edit. Neutral wording only. Keys are stable, so re-running adds only what is
 * missing and never touches an edit.
 */
const EXAMPLE = 'Example, edit me.'

export const STARTER_PILLARS: readonly StarterPillar[] = [
  {
    key: 'participation',
    title: 'Participation and growth',
    summary: 'More people playing, volunteering and belonging.',
    objectives: [
      { key: 'participation-juniors', title: 'Grow junior participation', progressNote: EXAMPLE },
      { key: 'participation-new-players', title: 'Welcome new players and keep them', progressNote: EXAMPLE },
      { key: 'participation-teams', title: 'Field a team in every grade we want', progressNote: EXAMPLE },
    ],
  },
  {
    key: 'facilities',
    title: 'Facilities and ground',
    summary: 'A safe, well kept ground and clubrooms.',
    objectives: [
      { key: 'facilities-ground', title: 'Keep the ground and pitches in good order', progressNote: EXAMPLE },
      { key: 'facilities-equipment', title: 'Replace worn equipment on a plan', progressNote: EXAMPLE },
    ],
  },
  {
    key: 'finance',
    title: 'Finance and sustainability',
    summary: 'A club that pays its way and plans ahead.',
    objectives: [
      { key: 'finance-budget', title: 'Agree a yearly budget and keep to it', progressNote: EXAMPLE },
      { key: 'finance-sponsors', title: 'Keep and grow sponsorship', progressNote: EXAMPLE },
      { key: 'finance-grants', title: 'Apply for grants that fit our plans', progressNote: EXAMPLE },
    ],
  },
  {
    key: 'community',
    title: 'Community and culture',
    summary: 'A friendly, inclusive club that is part of the community.',
    objectives: [
      { key: 'community-events', title: 'Run events that bring members and families together', progressNote: EXAMPLE },
      { key: 'community-conduct', title: 'Keep a clear code of conduct and follow it', progressNote: EXAMPLE },
    ],
  },
  {
    key: 'governance',
    title: 'Governance and people',
    summary: 'A committee that is organised and that shares the work.',
    objectives: [
      { key: 'governance-succession', title: 'Share the load and plan for the next committee', progressNote: EXAMPLE },
      { key: 'governance-volunteers', title: 'Thank and look after our volunteers', progressNote: EXAMPLE },
    ],
  },
]
