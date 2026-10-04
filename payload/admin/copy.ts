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
    syncRunning: 'Player stats are being updated right now.',
    syncFailed: "Last night's stats update did not finish. The site is still showing the previous numbers. Please tell the site administrator.",
    stories: (n: number) => `${n} ${n === 1 ? 'story is' : 'stories are'} waiting for approval`,
    photos: (n: number) => `${n} ${n === 1 ? 'photo is' : 'photos are'} waiting for approval`,
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
