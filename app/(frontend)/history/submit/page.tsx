import { getClub } from '@/lib/club'
import { canonicalFor, pageSeo } from '@/lib/site-metadata'
import { SubmitStoryPageClient } from './submit-story-page-client'

// Club copy is read per request, like every other public page.
export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  return { alternates: canonicalFor('/history/submit'), ...pageSeo(await getClub(), 'historySubmit') }
}

export default async function SubmitStoryPage() {
  const club = await getClub()
  return <SubmitStoryPageClient intro={club.storySubmitIntro} />
}
