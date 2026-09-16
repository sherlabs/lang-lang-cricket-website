import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { COOKIE_NAME, verifySessionCookie } from '@/lib/auth'

// Issues short-lived client upload tokens so the admin can send photos straight
// to Vercel Blob from the browser (server actions cap request bodies at ~4.5MB).
export async function POST(request: Request) {
  const token = cookies().get(COOKIE_NAME)?.value
  if (!token || !(await verifySessionCookie(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json()) as HandleUploadBody
  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith('gallery/')) throw new Error('Invalid upload path')
        return {
          allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
          maximumSizeInBytes: 15 * 1024 * 1024,
          addRandomSuffix: true,
        }
      },
      // The DB insert happens via addGalleryPhotos() once the client has all URLs,
      // because onUploadCompleted doesn't fire on localhost.
      onUploadCompleted: async () => {},
    })
    return NextResponse.json(json)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
