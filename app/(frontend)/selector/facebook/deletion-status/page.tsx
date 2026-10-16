import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { facebookConfig } from '@/lib/facebook-login'

export const metadata: Metadata = { title: 'Facebook link removed', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

/** Where Meta's data-deletion callback points: a plain statement, nothing to look up. */
export default function DeletionStatusPage() {
  if (!facebookConfig()) notFound()
  return (
    <main className="container-site py-16">
      <h1 className="display text-3xl">The Facebook link has been removed</h1>
      <p className="mt-4 max-w-prose text-brand-black/70">We no longer hold your Facebook sign-in. Your selector login stays; you can still sign in with your password.</p>
    </main>
  )
}
