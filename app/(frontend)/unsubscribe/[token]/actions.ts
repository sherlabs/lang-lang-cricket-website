'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { clientIp } from '@/lib/client-ip'
import { getPayloadClient } from '@/lib/payload/client'
import { resolveUnsub, undo, unsubscribe } from '@/lib/email/unsubscribe'

const field = (form: FormData, name: string): string => {
  const v = form.get(name)
  return typeof v === 'string' ? v.slice(0, 200) : ''
}

/** The confirm button. The token is re-checked here; a bad one goes back to the "not recognised" page. */
export async function unsubscribeAction(form: FormData): Promise<void> {
  const token = field(form, 'token')
  const payload = await getPayloadClient()
  const target = await resolveUnsub(payload, token, clientIp(await headers()))
  if (!target) redirect(`/unsubscribe/${encodeURIComponent(token)}`)
  await unsubscribe(payload, target)
  redirect(`/unsubscribe/${encodeURIComponent(token)}?r=done`)
}

export async function undoAction(form: FormData): Promise<void> {
  const token = field(form, 'token')
  const payload = await getPayloadClient()
  const ip = clientIp(await headers())
  const target = await resolveUnsub(payload, token, ip)
  if (!target) redirect(`/unsubscribe/${encodeURIComponent(token)}`)
  const r = await undo(payload, target, ip)
  redirect(`/unsubscribe/${encodeURIComponent(token)}?r=${r}`)
}
