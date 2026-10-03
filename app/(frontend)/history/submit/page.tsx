import { canonicalFor } from '@/lib/site-metadata'
import { SubmitStoryPageClient } from './submit-story-page-client'

export const metadata = {
  alternates: canonicalFor('/history/submit'),
  title: 'Share your story | Lang Lang Cricket Club',
  description:
    'Share your memories of Lang Lang Cricket Club in Caldermeade and help us preserve our history.',
}

export default function SubmitStoryPage() {
  return <SubmitStoryPageClient />
}
