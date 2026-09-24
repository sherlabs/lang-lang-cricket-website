'use client'

import { useRouter } from 'next/navigation'
import { addEventPhotos } from '../photo-actions'
import { BulkImageUploader } from '@/components/admin/bulk-image-uploader'

const MAX_EDGE = 1600

/** Bulk recap-photo uploader for a past event: uploads go to Blob under events/, then are registered in one batch. */
export function RecapUploader({ eventId }: { eventId: number }) {
  const router = useRouter()

  return (
    <BulkImageUploader
      prefix="events"
      maxEdge={MAX_EDGE}
      noun="photo"
      onUploaded={async (urls) => {
        await addEventPhotos(eventId, urls)
        router.refresh()
      }}
    />
  )
}
