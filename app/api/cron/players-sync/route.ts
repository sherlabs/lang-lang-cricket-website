import { syncPlayers } from '@/lib/players/sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Vercel Cron calls this daily (vercel.json) with `Authorization: Bearer $CRON_SECRET`.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  const result = await syncPlayers()
  return Response.json(result, { status: result.status === 'error' ? 500 : 200 })
}
