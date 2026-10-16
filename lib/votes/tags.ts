/** Cache tag for the public best-player leaderboard and the stats menu link. Changing the vote settings expires it. */
export const VOTES_TAG = 'votes-public'

/** How long the public leaderboard may lag behind a cast vote or a window closing (the window is time-based, so a short TTL is right). */
export const VOTES_BOARD_REVALIDATE_SECONDS = 300
