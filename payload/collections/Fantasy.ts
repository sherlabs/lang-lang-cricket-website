import { isAdmin, isAdminField, nobody, nobodyField } from '../access'
import { fantasySquadLock } from '../hooks/fantasy'
import { DEFAULT_RULES, DEFAULT_SCORING, SCORING_KEYS, SCORING_LABELS } from '../../lib/fantasy/rules'
import { internalCollection, num, rel, text } from './internalCollection'

/**
 * Club fantasy cricket (wave F spec 4.2, issue #36). Five collections, all written only by code (server actions and the nightly
 * sync, after their own role checks) and none of them in any menu: the committee runs the competition from the Fantasy cricket
 * view. The rules live on the season row (editable while it is a draft, frozen once it opens). No row holds an email, a phone number
 * or a real name: a manager is a team name and a hashed PIN.
 */

const rule = (name: string, defaultValue: number, label: string, min = 0, max = 100000) => num(name, { defaultValue, min, max, label, admin: { step: 1 } })

export const FantasySeasons = internalCollection({
  slug: 'fantasy-seasons',
  singular: 'Fantasy season',
  plural: 'Fantasy seasons (data)',
  description: 'One fantasy competition per season, with its rules. Managed in the Fantasy cricket view.',
  defaultColumns: ['seasonStartYear', 'name', 'status'],
  fields: [
    num('seasonStartYear', { required: true, unique: true, index: true }),
    text('name', { required: true }),
    { name: 'status', type: 'select', required: true, defaultValue: 'draft', index: true, options: [{ label: 'Draft', value: 'draft' }, { label: 'Open', value: 'open' }, { label: 'Closed', value: 'closed' }] },
    { name: 'openedAt', type: 'date' },
    rule('maxEntries', DEFAULT_RULES.maxEntries, 'Most managers', 1, 5000),
    rule('squadSize', DEFAULT_RULES.squadSize, 'Players in a squad', 1, 15),
    rule('salaryCapTenths', DEFAULT_RULES.salaryCapTenths, 'Salary cap (tenths of a credit)', 10),
    rule('captainMultiplier', DEFAULT_RULES.captainMultiplier, 'Captain multiplier', 1, 5),
    rule('transfersPerRound', DEFAULT_RULES.transfersPerRound, 'Changes allowed per round (0 is unlimited)', 0, 15),
    rule('minPriceTenths', DEFAULT_RULES.minPriceTenths, 'Lowest price (tenths)', 5, 1000),
    rule('maxPriceTenths', DEFAULT_RULES.maxPriceTenths, 'Highest price (tenths)', 5, 1000),
    rule('priceSeasonsBack', DEFAULT_RULES.priceSeasonsBack, 'Seasons used for prices', 1, 5),
    rule('priorGames', DEFAULT_RULES.priorGames, 'Prior games for the price formula', 0, 20),
    rule('minGamesForPrice', DEFAULT_RULES.minGamesForPrice, 'Games before a price is trusted', 0, 50),
    { name: 'blockedWords', type: 'text', hasMany: true, admin: { description: 'Team names containing one of these words are refused.' } },
    {
      name: 'scoring',
      type: 'group',
      fields: SCORING_KEYS.map((k) => rule(k, DEFAULT_SCORING[k], SCORING_LABELS[k], -100, 200)),
    },
    {
      name: 'adminLog',
      type: 'json',
      access: { read: isAdminField, create: nobodyField, update: nobodyField },
      admin: { description: 'The last few committee actions (PIN resets, disabled teams). Shown to administrators on the Home page. Holds no PIN.' },
    },
  ],
})

export const FantasyRoundState = internalCollection({
  slug: 'fantasy-round-state',
  singular: 'Fantasy round',
  plural: 'Fantasy rounds (data)',
  description: 'What cannot be worked out from the fixtures: the lowest lock time seen, a committee lock override and a manual scored mark.',
  defaultColumns: ['weekendKey', 'locksAt', 'scoredManually'],
  indexes: [{ fields: ['season', 'weekendKey'], unique: true }],
  fields: [
    rel('season', 'fantasy-seasons', { required: true, index: true }),
    text('weekendKey', { required: true }),
    { name: 'locksAt', type: 'date' },
    { name: 'lockOverride', type: 'date' },
    { name: 'scoredManually', type: 'checkbox', defaultValue: false },
    text('scoredReason'),
    rel('scoredBy', 'users'),
    { name: 'scoredAt', type: 'date' },
  ],
})

export const FantasyPrices = internalCollection({
  slug: 'fantasy-prices',
  singular: 'Fantasy price',
  plural: 'Fantasy prices (data)',
  description: 'The price of each senior player for the season, with the numbers behind it.',
  defaultColumns: ['player', 'priceTenths', 'available'],
  indexes: [{ fields: ['season', 'player'], unique: true }],
  fields: [
    rel('season', 'fantasy-seasons', { required: true, index: true }),
    rel('player', 'players', { required: true, index: true }),
    num('priceTenths', { required: true }),
    num('autoPriceTenths', { required: true }),
    { name: 'overridden', type: 'checkbox', defaultValue: false },
    { name: 'available', type: 'checkbox', defaultValue: true },
    { name: 'basis', type: 'json' },
  ],
})

const secretField = { read: nobodyField, create: nobodyField, update: nobodyField }

export const FantasyEntries = internalCollection({
  slug: 'fantasy-entries',
  singular: 'Fantasy manager',
  plural: 'Fantasy managers (data)',
  description: 'A manager is a team name and a hashed PIN. No email, phone number or real name is stored.',
  defaultColumns: ['teamName', 'season', 'disabled'],
  read: isAdmin,
  indexes: [{ fields: ['season', 'nameKey'], unique: true }],
  fields: [
    rel('season', 'fantasy-seasons', { required: true, index: true }),
    text('teamName', { required: true }),
    text('nameKey', { required: true }),
    text('pinHash', { access: secretField }),
    text('pinSalt', { access: secretField }),
    { name: 'pinSetAt', type: 'date' },
    { name: 'mustChangePin', type: 'checkbox', defaultValue: false },
    text('deviceCodeHash', { access: secretField }),
    { name: 'deviceCodeExpires', type: 'date', access: secretField },
    { name: 'disabled', type: 'checkbox', defaultValue: false },
  ],
})

export const FantasySquads = internalCollection({
  slug: 'fantasy-squads',
  singular: 'Fantasy squad',
  plural: 'Fantasy squads (data)',
  description: 'The squad a manager picked for a round. Nobody reads these over the API: only server code that has checked the round is locked.',
  defaultColumns: ['entry', 'round', 'savedAt'],
  // Not even staff: an editor who also plays must not browse rivals' picks before the lock.
  read: nobody,
  indexes: [{ fields: ['entry', 'round'], unique: true }],
  hooks: { beforeChange: [fantasySquadLock] },
  fields: [
    rel('entry', 'fantasy-entries', { required: true, index: true }),
    text('round', { required: true }),
    rel('captain', 'players'),
    num('spentTenths', { required: true, defaultValue: 0 }),
    num('transfersUsed', { required: true, defaultValue: 0 }),
    { name: 'picks', type: 'array', fields: [rel('player', 'players', { required: true })] },
    { name: 'savedAt', type: 'date' },
  ],
})

export const fantasyCollections = [FantasySeasons, FantasyRoundState, FantasyPrices, FantasyEntries, FantasySquads]
