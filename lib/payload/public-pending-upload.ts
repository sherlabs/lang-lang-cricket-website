import { NextResponse } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { blobToken } from '@/payload/env'

/**
 * POST handler for an anonymous client upload into one pending folder (spec §7.2). Kept
 * OUTSIDE the storage plugin: exposing the plugin's client-upload route to anonymous users
 * would let them mint upload tokens for every collection. Locked down hard: images only
 * (jpeg/png/webp), 8 MB, every pathname directly under `pendingPrefix`, random suffix.
 * Without a Blob token (local dev, tests) uploads are unavailable: 503.
 */
export function publicPendingUploadHandler(pendingPrefix: `${string}/pending/`) {
  return async function POST(request: Request) {
    const token = blobToken()
    if (!token) return NextResponse.json({ error: 'Uploads are unavailable.' }, { status: 503 })
    let body: HandleUploadBody
    try {
      body = (await request.json()) as HandleUploadBody
    } catch {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
    try {
      const json = await handleUpload({
        body,
        request,
        token,
        onBeforeGenerateToken: async (pathname) => {
          if (!pathname.startsWith(pendingPrefix) || pathname.includes('..') || pathname.slice(pendingPrefix.length).includes('/')) {
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
}
