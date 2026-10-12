import type { GlobalConfig } from 'payload'
import { isAdmin, isSelection } from '../access'
import { hiddenFromEditors } from '../admin/visibility'
import { DEFAULT_VOTE_SETTINGS, validateBallotValues } from '../../lib/votes/settings'
import { VOTES } from '../../config/site'
import { VOTES_TAG } from '../../lib/votes/tags'
import { revalidatePaths } from '../hooks/revalidate'

/**
 * Settings for the selector tools (announce-teams spec 4.5). `linkVersion` is the availability link: rotating it (the selector
 * area's "Rotate link" button adds one) instantly invalidates the old link, every remembered device and every lock key. The
 * link itself is derived from it and never stored. Readable by selection users; changed here by an admin or from the selector
 * area by an action that checks the caller's role.
 */
export const SelectionSettings: GlobalConfig = {
  slug: 'selection-settings',
  label: 'Selection settings',
  admin: { group: false, hidden: hiddenFromEditors, description: 'The availability link and selection options. Selectors change the link from the selector area.' },
  access: { read: isSelection, update: isAdmin },
  // The public leaderboard and the stats menu link read the vote options through a short cache; a change expires it at once.
  hooks: { afterChange: [async ({ doc, context }) => { await revalidatePaths([], context, [VOTES_TAG]); return doc }] },
  fields: [
    { name: 'linkEnabled', type: 'checkbox', defaultValue: true, label: 'Availability link is switched on', admin: { description: 'Untick to turn the link off: everyone who opens it sees a "page not found".' } },
    { name: 'linkVersion', type: 'number', defaultValue: 1, min: 1, required: true, label: 'Link version', admin: { description: 'Add one to give everyone a new link. The old link, and every remembered phone, stops working at once.' } },
    { name: 'availabilityLockHours', type: 'number', defaultValue: 0, min: 0, label: 'Close availability this many hours before a game', admin: { description: '0 keeps availability open until the game. After it closes, players see "Selection has started; call a selector".' } },
    {
      name: 'defaultXiSize',
      type: 'number',
      defaultValue: 11,
      min: 0,
      max: 13,
      validate: (v: number | null | undefined) => (v == null || [0, 11, 12, 13].includes(v) ? true : 'Use 11, 12 or 13, or 0 for no limit.'),
      label: 'Players in a team (new teams)',
      admin: { description: '11, 12 or 13. A selector can change it for one game. 0 means no limit.' },
    },
    { name: 'publishBattingOrder', type: 'checkbox', defaultValue: true, label: 'Show the batting order on the public teams page', admin: { description: 'Untick to list the team alphabetically without numbers (captain and keeper stay marked).' } },
    { name: 'announceOnPublish', type: 'checkbox', defaultValue: true, label: 'Post a site announcement when teams are published', admin: { description: 'Adds one announcement per weekend (updated if the teams change) that links to the teams page.' } },
      {
      name: 'votes',
      type: 'group',
      label: `${VOTES.label} votes`,
      admin: { description: 'Players vote after a game from the availability link. Selectors change these in the selector area (Votes, Settings).' },
      fields: [
        { name: 'enabled', type: 'checkbox', defaultValue: false, label: 'Voting is switched on', admin: { description: 'Off hides every vote screen. Before you switch it on, set a manual 6-digit PIN for players who use the default last-4 PIN.' } },
        { name: 'allowSelfVote', type: 'checkbox', defaultValue: false, label: 'Players may vote for themselves' },
        { name: 'ballotValues', type: 'text', defaultValue: DEFAULT_VOTE_SETTINGS.ballotValues.join(','), validate: validateBallotValues, label: 'Points for 1st, 2nd, 3rd...', admin: { description: 'From highest to lowest, at most 5, for example 3,2,1. Changing this changes every total, including past games.' } },
        { name: 'tieBreakFewestGames', type: 'checkbox', defaultValue: false, label: 'On equal points, fewer games ranks higher', admin: { description: 'Ties are first split by the most top votes. This also rewards players who played fewer games, so it is off by default.' } },
        { name: 'voteWindowDays', type: 'number', defaultValue: DEFAULT_VOTE_SETTINGS.voteWindowDays, min: 1, max: 60, label: 'Days voting stays open after a game' },
        { name: 'editWindowHours', type: 'number', defaultValue: DEFAULT_VOTE_SETTINGS.editWindowHours, min: 0, max: 336, label: 'Hours a player can change their vote' },
        { name: 'minBallotsToCount', type: 'number', defaultValue: DEFAULT_VOTE_SETTINGS.minBallotsToCount, min: VOTES.minBallotsFloor, max: 100, label: 'Votes needed before a game counts', admin: { description: 'A game with fewer votes counts nowhere, so a total cannot point at one voter. About 40% of the players in a typical game is a good number; fewer than 3 is not allowed.' } },
        { name: 'publicLeaderboard', type: 'checkbox', defaultValue: false, label: 'Show a public leaderboard on the site', admin: { description: 'Shows season totals of games whose voting has closed. Never shows who voted for whom or how a single game went.' } },
        { name: 'publicScope', type: 'select', defaultValue: 'club', options: [{ label: 'Whole club', value: 'club' }, { label: 'Each grade', value: 'grade' }, { label: 'Both', value: 'both' }], label: 'Public leaderboard covers' },
        { name: 'publicShowBreakdown', type: 'checkbox', defaultValue: true, label: 'Show the 3s, 2s and 1s columns publicly' },
      ],
    },
  ],
}
