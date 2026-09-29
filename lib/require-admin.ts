import { cookies } from 'next/headers'
import { COOKIE_NAME, verifySessionCookie } from '@/lib/auth'

/**
 * Guard for admin server actions. Middleware only covers /admin page requests;
 * a server action can be POSTed to any route with a Next-Action header, so every
 * exported admin action must call this itself.
 */
export async function requireAdmin() {
  const token = cookies().get(COOKIE_NAME)?.value
  if (!token || !(await verifySessionCookie(token))) throw new Error('Unauthorized')
}
