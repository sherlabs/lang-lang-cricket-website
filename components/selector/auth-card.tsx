/** The centred card used by the sign-in and invite pages (mobile first: full width on a phone, 28rem on larger screens). */
export function AuthCard({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  return (
    <main className="container-site py-10 sm:py-16">
      <div className="mx-auto w-full max-w-md rounded-2xl bg-white p-5 shadow-sm ring-1 ring-brand-black/10 sm:p-8">
        <h1 className="display text-3xl text-brand-black">{title}</h1>
        {intro && <p className="mt-2 text-sm leading-relaxed text-brand-grey">{intro}</p>}
        <div className="mt-6 space-y-5">{children}</div>
      </div>
    </main>
  )
}

export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-brand-grey" aria-hidden>
      <span className="h-px flex-1 bg-brand-black/10" />
      or
      <span className="h-px flex-1 bg-brand-black/10" />
    </div>
  )
}
