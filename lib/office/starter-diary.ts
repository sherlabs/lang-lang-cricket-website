import type { StarterJob } from './diary'

/**
 * Generic standard jobs for "Add the standard jobs for {season}" (wave D spec 7.2). Neutral wording only: a club adds its own
 * regional requirements (licences, returns, local bodies) by editing or adding jobs. The month offset counts from the first month of
 * the season (0 is the start month), so it follows whichever start month the club's config sets. Each job has a stable key, so
 * re-running adds only what is missing and never touches an edit.
 */
export const STARTER_JOBS: readonly StarterJob[] = [
  { key: 'registration-open', title: 'Open player registration', category: 'registration', monthOffset: 0, day: 1, repeatsYearly: true },
  { key: 'body-registration-fees', title: 'Pay registration and membership fees to the governing body', category: 'registration', monthOffset: 1, day: 15, repeatsYearly: true },
  { key: 'insurance-renewal', title: 'Renew the club insurance', category: 'insurance', monthOffset: 0, day: 15, repeatsYearly: true },
  { key: 'permit-renewals', title: 'Renew permits and licences', category: 'permits', monthOffset: 1, day: 1, repeatsYearly: true },
  { key: 'food-venue-permit-check', title: 'Food and venue permit check', category: 'permits', monthOffset: 2, day: 1, repeatsYearly: true },
  { key: 'ground-preparation', title: 'Prepare the ground and pitches', category: 'ground', monthOffset: 1, day: 20, repeatsYearly: true },
  { key: 'equipment-check', title: 'Check and order equipment', category: 'ground', monthOffset: 1, day: 10, repeatsYearly: true },
  { key: 'working-bee', title: 'Hold a working bee', category: 'ground', monthOffset: 2, day: 10, repeatsYearly: true },
  { key: 'tax-reporting', title: 'Lodge tax and reporting returns', category: 'finance', monthOffset: 4, day: 28, repeatsYearly: true },
  { key: 'general-meeting', title: 'Hold the yearly general meeting', category: 'governance', monthOffset: 10, day: 15, repeatsYearly: true },
  { key: 'awards-event', title: 'Plan the awards event', category: 'events', monthOffset: 9, day: 1, repeatsYearly: true },
  { key: 'season-review', title: 'Review the season', category: 'governance', monthOffset: 11, day: 1, repeatsYearly: true },
]
