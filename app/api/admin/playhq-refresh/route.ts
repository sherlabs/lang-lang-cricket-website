import { revalidatePath, revalidateTag } from 'next/cache'
import { requireStaff } from '@/lib/payload/staff-route'

/** POST (staff): refetch PlayHQ fixtures, results and ladders on next view (spec §8.4). */
export async function POST(request: Request) {
  const gate = await requireStaff(request)
  if ('response' in gate) return gate.response

  revalidateTag('playhq', 'max')
  revalidatePath('/fixtures')
  revalidatePath('/fixtures/[gameId]', 'page')
  return Response.json({ ok: true, refreshedAt: new Date().toISOString() })
}
