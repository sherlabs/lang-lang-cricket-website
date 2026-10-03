import { announcementsStep } from './announcements'
import { clubStep } from './club'
import { documentsStep } from './documents'
import { eventPhotosStep } from './event-photos'
import { eventRsvpsStep } from './event-rsvps'
import { eventsStep } from './events'
import { galleryPhotosStep } from './gallery-photos'
import { peopleStep } from './people'
import { playerAliasesStep } from './player-aliases'
import { playerSeasonsStep } from './player-seasons'
import { playerSyncRunsStep } from './player-sync-runs'
import { playersStep } from './players'
import { siteSettingsStep } from './site-settings'
import { sponsorsStep } from './sponsors'
import { storiesStep } from './stories'
import type { EtlStep } from './types'

/** Spec §12.2 order (foreign keys). WP4 adds stories; WP5 the players steps. */
export const ETL_STEPS: EtlStep[] = [
  siteSettingsStep,
  clubStep,
  documentsStep,
  galleryPhotosStep,
  sponsorsStep,
  peopleStep,
  announcementsStep,
  eventsStep,
  eventRsvpsStep,
  eventPhotosStep,
  storiesStep,
  playersStep,
  playerAliasesStep,
  playerSeasonsStep,
  playerSyncRunsStep,
]
