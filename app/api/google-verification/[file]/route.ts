import { googleVerificationBody } from '@/config/site'

/** Serves `/google<16 hex>.html` (rewritten here by next.config.ts) only when env GOOGLE_SITE_VERIFICATION_FILE names that file. */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params
  const body = googleVerificationBody(file)
  if (body === null) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } })
  return new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600' } })
}
