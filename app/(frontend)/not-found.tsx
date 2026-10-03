import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="container-site py-24">
      <div className="mx-auto max-w-xl rounded-2xl bg-brand-stone p-10 text-center">
        <p className="eyebrow">404</p>
        <h1 className="display mt-3 text-4xl text-brand-black">Page not found</h1>
        <p className="mt-4 text-sm text-brand-grey">
          Sorry, we couldn&apos;t find that page. It may have moved, or the link may be out of date.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-md bg-brand-black px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-charcoal"
          >
            Back to homepage
          </Link>
        </div>
      </div>
    </main>
  )
}
