'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { checkPassword, createSessionCookie, COOKIE_NAME } from '@/lib/auth'

export async function login(_prevState: { error: string } | undefined, formData: FormData) {
  const password = String(formData.get('password') ?? '')
  if (!(await checkPassword(password))) {
    return { error: 'Incorrect password.' }
  }
  const token = await createSessionCookie()
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  })
  redirect('/admin')
}

export async function logout() {
  cookies().set(COOKIE_NAME, '', { maxAge: 0, path: '/' })
  redirect('/admin/login')
}
