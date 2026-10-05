import { CLUB_TIMEZONE } from '@/config/site'
import { localDateOf } from './weekend'

/** Today's date (YYYY-MM-DD) in club time. */
export const currentClubDate = (now: Date = new Date()): string => localDateOf(now, CLUB_TIMEZONE)
