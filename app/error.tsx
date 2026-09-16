'use client'

import Link from 'next/link'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="container-site py-24">
      <div className="mx-auto max-w-xl rounded-2xl bg-brand-stone p-10 text-center">
        <p className="eyebrow">Error</p>
        <h1 className="display mt-3 text-4xl text-brand-black">Something went wrong</h1>
        <p className="mt-4 text-sm text-brand-grey">
          Sorry, that page could not be shown. You can try again, or head back to the homepage.
          {error.digest && <span className="sr-only"> Reference {error.digest}.</span>}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex min-h-11 items-center rounded-md bg-brand-black px-5 py-2 text-sm font-semibold text-brand-gold transition hover:bg-brand-charcoal"
          >
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-md border border-brand-black/15 bg-white px-5 py-2 text-sm font-semibold text-brand-charcoal transition hover:border-brand-gold hover:text-brand-gold-deep"
          >
            Back to homepage
          </Link>
        </div>
      </div>
    </main>
  )
}
