import { publicPendingUploadHandler } from '@/lib/payload/public-pending-upload'

/**
 * Unauthenticated on purpose: visitors submit and edit history stories without logging in
 * (cover and inline images; see app/(frontend)/history/submit/actions.ts). Moved from
 * /api/stories/upload (spec §7.2). The only folder they may write to is stories/pending/;
 * the handler holds the rest of the lock-down.
 */
export const POST = publicPendingUploadHandler('stories/pending/')
