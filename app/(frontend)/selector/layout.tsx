import type { Metadata } from 'next'

// Private tools: never indexed, never cached, never prerendered (they read the signed-in person on every request).
export const metadata: Metadata = { title: 'Selectors', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default function SelectorRootLayout({ children }: { children: React.ReactNode }) {
  return children
}
