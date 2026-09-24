import { NextResponse } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'

// Unauthenticated on purpose: public visitors submit recap photos for a past
// event without logging in (see app/events/[id]/actions.ts's submitEventPhoto).
// Locked down hard to limit abuse, matching app/api/stories/upload/route.ts's
// pattern exactly: images only, 8MB cap, and every pathname must fall under
// events/pending/ (checked below), so pending public submissions are easy to
// distinguish from admin-authored recap photos (which upload under events/
// via the admin-authenticated /api/admin/upload route).
export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody
  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith('events/pending/')) {
          throw new Error('Invalid upload path')
        }
        return {
          allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
          maximumSizeInBytes: 8 * 1024 * 1024,
          addRandomSuffix: true,
        }
      },
      onUploadCompleted: async () => {},
    })
    return NextResponse.json(json)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
