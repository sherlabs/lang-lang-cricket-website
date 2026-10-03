/** Sub-section heading: display title, optional count pill and a hairline rule (DESIGN.md). */
export function SubHeading({ title, count, id }: { title: string; count?: number; id?: string }) {
  return (
    <div className="flex items-center gap-3">
      <h2 id={id} className="display text-2xl text-brand-black sm:text-3xl">{title}</h2>
      {count != null && (
        <span className="rounded-full bg-brand-gold-pale px-2.5 py-0.5 text-xs font-semibold tabular-nums text-brand-gold-deep">{count}</span>
      )}
      <span className="h-px flex-1 bg-brand-black/10" aria-hidden />
    </div>
  )
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-brand-stone p-8 text-center text-sm text-brand-grey">{children}</p>
}
