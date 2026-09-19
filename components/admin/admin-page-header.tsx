type Props = {
  eyebrow: string
  title: string
  intro?: string
  children?: React.ReactNode
}

/** Title block at the top of every admin page. */
export function AdminPageHeader({ eyebrow, title, intro, children }: Props) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 sm:mb-10">
      <div className="max-w-2xl">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="display mt-2 text-4xl text-brand-black sm:text-5xl">{title}</h1>
        {intro && <p className="mt-3 text-base leading-relaxed text-brand-grey">{intro}</p>}
      </div>
      {children}
    </div>
  )
}
