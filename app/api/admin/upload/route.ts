import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { COOKIE_NAME, verifySessionCookie } from '@/lib/auth'

const ALLOWED_PREFIXES = ['gallery/', 'sponsors/', 'documents/', 'stories/', 'contacts/']

// Issues short-lived client upload tokens so admin pages can send files straight
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
        if (!ALLOWED_PREFIXES.some((p) => pathname.startsWith(p))) throw new Error('Invalid upload path')
        return {
          allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
          maximumSizeInBytes: 15 * 1024 * 1024,
          addRandomSuffix: true,
        }
      },
      // DB writes happen in server actions once the client has the URL,
      // because onUploadCompleted doesn't fire on localhost.
      onUploadCompleted: async () => {},
    })
    return NextResponse.json(json)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
