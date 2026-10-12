/**
 * Browser tab title: "Events — Website Admin". Payload reads the suffix when the config loads, before any
 * database read, so it stays club-neutral (the club's name is shown by the admin logo and dashboard).
 */
export const adminTitleSuffix = ' — Website Admin'

/**
 * Plain-English overrides for Payload's built-in wording (English only). Placeholders such as
 * {{label}} and <1>{{title}}</1> must stay exactly as Payload writes them.
 */
export const adminTranslations = {
  en: {
    general: {
      aboutToDelete: 'You are about to delete the {{label}} <1>{{title}}</1>. This takes it off the website and cannot be undone. Are you sure?',
      aboutToDeleteCount_one: 'You are about to delete {{count}} {{label}}. This takes it off the website and cannot be undone.',
      aboutToDeleteCount_other: 'You are about to delete {{count}} {{label}}. This takes them off the website and cannot be undone.',
      aboutToDeleteCount_many: 'You are about to delete {{count}} {{label}}. This takes them off the website and cannot be undone.',
      confirmDeletion: 'Delete for good?',
      createNew: 'Add new',
      noResults: 'Nothing here yet. Use the "Add new" button to create the first one.',
      updatedSuccessfully: 'Saved. Your change is now on the website.',
      deletedSuccessfully: 'Deleted.',
    },
    validation: {
      required: 'Please fill this in.',
      emailAddress: 'That does not look like an email address. Check for typos.',
    },
  },
}

/**
 * Notification centre wording (W2 spec 6.4). The committee gets plain sentences and never raw error text; the technical
 * counts are for the site administrator. Everything the Home page says about the PlayHQ update lives here.
 */
export const notificationCopy = {
  committee: {
    syncOk: 'Player stats were updated last night.',
    syncOkOlder: (when: string) => `Player stats were last updated ${when}.`,
    syncFailedOlder: (when: string) => `The stats update failed on ${when} and has not worked since. The site is still showing the previous numbers. Please tell the site administrator.`,
    syncRunning: 'Player stats are being updated right now.',
    syncFailed: "Last night's stats update did not finish. The site is still showing the previous numbers. Please tell the site administrator.",
    stories: (n: number) => `${n} ${n === 1 ? 'story is' : 'stories are'} waiting for approval`,
    photos: (n: number) => `${n} ${n === 1 ? 'photo is' : 'photos are'} waiting for approval`,
    socialFailed: (n: number) => `${n} social ${n === 1 ? 'post needs' : 'posts need'} your attention`,
    socialToday: (n: number) => `${n} ${n === 1 ? 'post is' : 'posts are'} scheduled for today`,
    socialOverdue: (n: number) => `${n} scheduled ${n === 1 ? 'post is' : 'posts are'} overdue. The scheduler may not be running`,
    caughtUp: 'Nothing is waiting. You are all caught up.',
  },
  admin: {
    syncCounts: (c: { matchesUpserted: number; matchError: number; matchMismatches: number }) =>
      `Matches saved: ${c.matchesUpserted}. Matches that did not save: ${c.matchError}. Players whose match totals disagree with their season totals: ${c.matchMismatches}.`,
    syncError: (message: string) => `Update error: ${message}`,
    syncRuns: 'Open the sync runs',
    duplicates: (n: number) => `${n} possible duplicate ${n === 1 ? 'player' : 'players'} to look at`,
    imports: (count: number, when: string, seasons: number, matches: number) =>
      `${count} import${count === 1 ? '' : 's'} in the history. The latest was ${when} (${seasons} season ${seasons === 1 ? 'row' : 'rows'}, ${matches} ${matches === 1 ? 'game' : 'games'}).`,
    importsOpen: 'Open Player data tools',
  },
} as const

/**
 * Club office wording (wave D spec section 8, "honest numbers"). Every count says what it leaves out, so a number is never read as
 * more than it is. Unit-tested for zero, one and many (`tests/office-copy.test.ts`).
 */
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)
export const officeCopy = {
  members: {
    noEmail: (n: number) => `${n} active ${plural(n, 'member has', 'members have')} no email (past members and people on the do-not-email list are not counted)`,
    noPhone: (n: number) => `${n} active ${plural(n, 'member has', 'members have')} no phone (past members are not counted)`,
    noBoth: (n: number) => `${n} active ${plural(n, 'member has', 'members have')} neither an email nor a phone (past members are not counted)`,
    total: (n: number) => `${n} active ${plural(n, 'member', 'members')} (past members are not counted)`,
    complete: 'Every active member has an email and a phone.',
    stat: (total: number, noEmail: number) =>
      total === 0 ? 'No members yet' : `${total} active ${plural(total, 'member', 'members')}, ${noEmail} with no email (past members and the do-not-email list are not counted)`,
    duplicate: (n: number) => `${n} email ${plural(n, 'address is', 'addresses are')} shared by more than one member`,
  },
  fees: {
    excludes: 'Archived members, appearances that could not be matched to a member, appearances in games that are not in the match store, and voided rows are not counted.',
    openNote: 'Figures for the open season are worked out from match data and can change if that data changes (for example after a PlayHQ sync or a player merge). Close the season to freeze them.',
    paidLabel: 'Paid (all payments to date, targeted payments first)',
    paidSpecificLabel: 'Paid specifically for this season',
    quality: (unmatched: number, missing: number) => {
      const parts: string[] = []
      if (unmatched > 0) parts.push(`${unmatched} ${plural(unmatched, 'appearance', 'appearances')} could not be matched to a member`)
      if (missing > 0) parts.push(`${missing} ${plural(missing, 'appearance is', 'appearances are')} in games that are not in the match store (junior games may be missing)`)
      return `${parts.join(', and ')}, so the totals below may be incomplete.`
    },
    drift: (derived: string, stored: string) => `Match data now gives ${derived}; the closed figure is ${stored}. Nothing was changed.`,
    stat: (members: number, owed: string) => (members === 0 ? 'Nothing owing in the open season (unmatched appearances are not counted)' : `${members} ${plural(members, 'member owes', 'members owe')} ${owed} in match fees (open season, unmatched appearances not counted)`),
    notification: (members: number, owed: string) => `${members} ${plural(members, 'member owes', 'members owe')} ${owed} in match fees (open season, unmatched appearances not counted)`,
  },
  volunteers: {
    excludes: 'Voided entries, people who did not turn up, weeks that are not confirmed yet and any group of fewer than 3 people are not shown. Hours of past members still count in the totals.',
    stat: (when: string | null, empty: number, slots: number) =>
      when === null ? 'No volunteer weeks set up yet' : slots === 0 ? `No jobs set up yet for ${when}` : `${empty} of ${slots} volunteer ${plural(slots, 'place is', 'places are')} empty for ${when} (cancelled and no-show people are not counted)`,
    notification: (empty: number, when: string) => `${empty} volunteer ${plural(empty, 'place is', 'places are')} still empty for ${when} (cancelled and no-show people are not counted)`,
    warning: (w: { kind: 'double-booked' | 'over-capacity' | 'said-no' }, name: string, job: string) =>
      w.kind === 'double-booked' ? `${name} is on more than one job this day.` : w.kind === 'over-capacity' ? `${job} has more people than it needs.` : `${name} said they cannot do this day.`,
    fewer: 'Fewer than 3 people',
    withheld: 'Some figures are not shown because a small group could be worked out from them, for example by taking one table away from another.',
  },
  meetings: {
    excludes: 'Done and dropped actions are not counted. Restricted actions are counted only for office-bearers.',
    stat: (next: string | null, overdue: number) =>
      `${next ? `Next meeting ${next}` : 'No meeting planned'}; ${overdue === 0 ? 'no committee actions are overdue' : `${overdue} committee ${plural(overdue, 'action is', 'actions are')} overdue`} (done and dropped actions are not counted; restricted actions only for office-bearers)`,
    overdue: (n: number) => `${n} committee ${plural(n, 'action is', 'actions are')} overdue (done and dropped actions are not counted; restricted actions only for office-bearers)`,
    blocked: (n: number) => `${n} committee ${plural(n, 'action is', 'actions are')} blocked (done and dropped actions are not counted; restricted actions only for office-bearers)`,
    hiddenItems: (n: number) => `${n} restricted ${plural(n, 'item is', 'items are')} only visible to office-bearers.`,
    hiddenMeetings: (n: number) => `${n} restricted ${plural(n, 'meeting is', 'meetings are')} only visible to office-bearers.`,
  },
  landing: {
    empty: 'Nothing else is set up for the committee here yet. When more of the club office is switched on, it will appear on this page.',
    adminOnlyNote: 'Members, and the exports and sends log, are for admins only.',
  },
} as const
