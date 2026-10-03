import { publicPendingUploadHandler } from '@/lib/payload/public-pending-upload'

/**
 * Unauthenticated on purpose: visitors submit recap photos for a past event without logging
 * in (see app/(frontend)/events/[id]/actions.ts's submitEventPhoto). The only folder they may
 * write to is events/pending/ (spec §7.2); the handler holds the rest of the lock-down.
 */
export const POST = publicPendingUploadHandler('events/pending/')
