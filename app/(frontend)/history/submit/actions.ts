'use server'

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getPayloadClient } from '@/lib/payload/client'
import { DRAFT_COOKIE } from '@/lib/story-tokens'
import { parseStoryForm, validationMessage } from '@/lib/stories-form'

/**
 * Public, no-login story submission (spec §5, §6). The honeypot, the required fields and the
 * `llcc_story_draft` cookie are unchanged. The body goes through the conversion pipeline; the
 * collection hooks set the slug, the tokens, `status: pending` and `submittedByAdmin: false`
 * (`context.publicSubmission`), and the tokens are read back from the create result.
 */
export async function submitStory(formData: FormData): Promise<{ error: string } | void> {
  // Honeypot: real visitors never see or fill this hidden field. A bot that
  // fills every field does — pretend success without writing anything, so
  // as not to tip it off.
  if (String(formData.get('website') ?? '').trim() !== '') {
    redirect('/history/submit?submitted=1')
  }

  const payload = await getPayloadClient()
  const parsed = await parseStoryForm(payload, formData)
  if ('error' in parsed) return parsed

  let created: { title: string; editToken?: string | null; viewToken?: string | null }
  try {
    created = await payload.create({
      collection: 'stories',
      // `status` is forced to pending by storyLifecycle under publicSubmission anyway.
      data: { ...parsed.data, status: 'pending' },
      overrideAccess: true,
      depth: 0,
      context: { publicSubmission: true },
    })
  } catch (err) {
    const message = validationMessage(err)
    if (message) return { error: message }
    throw err
  }

  // Not put in the URL: query params linger in browser history and can leak
  // via the Referer header to any outbound link on the confirmation page.
  // A cookie keeps it off the URL and lets the submitter come back later.
  const jar = await cookies()
  jar.set(DRAFT_COOKIE, JSON.stringify({ title: created.title, editToken: created.editToken, viewToken: created.viewToken }), {
    maxAge: 60 * 60 * 24 * 180,
    path: '/',
    sameSite: 'lax',
  })

  redirect('/history/submit?submitted=1')
}
