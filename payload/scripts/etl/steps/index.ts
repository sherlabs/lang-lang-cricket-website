import { announcementsStep } from './announcements'
import { clubStep } from './club'
import { documentsStep } from './documents'
import { galleryPhotosStep } from './gallery-photos'
import { peopleStep } from './people'
import { siteSettingsStep } from './site-settings'
import { sponsorsStep } from './sponsors'
import type { EtlStep } from './types'

/** Spec §12.2 order (foreign keys). WP3–WP5 append events, stories and players steps. */
export const ETL_STEPS: EtlStep[] = [
  siteSettingsStep,
  clubStep,
  documentsStep,
  galleryPhotosStep,
  sponsorsStep,
  peopleStep,
  announcementsStep,
]
