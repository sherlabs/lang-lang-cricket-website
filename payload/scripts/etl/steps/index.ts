import { announcementsStep } from './announcements'
import { clubStep } from './club'
import { documentsStep } from './documents'
import { eventPhotosStep } from './event-photos'
import { eventRsvpsStep } from './event-rsvps'
import { eventsStep } from './events'
import { galleryPhotosStep } from './gallery-photos'
import { peopleStep } from './people'
import { siteSettingsStep } from './site-settings'
import { sponsorsStep } from './sponsors'
import type { EtlStep } from './types'

/** Spec §12.2 order (foreign keys). WP4–WP5 append stories and players steps. */
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
]
