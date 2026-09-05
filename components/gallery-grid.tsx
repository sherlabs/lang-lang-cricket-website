'use client'

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, X, Maximize2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type GalleryPhoto = {
  id: number
  url: string
  caption: string
}

export function GalleryGrid({ photos }: { photos: GalleryPhoto[] }) {
  const [index, setIndex] = useState<number | null>(null)
  const isOpen = index !== null

  const close = useCallback(() => setIndex(null), [])
  const step = useCallback(
    (dir: 1 | -1) => {
      setIndex((i) => (i === null ? i : (i + dir + photos.length) % photos.length))
    },
    [photos.length]
  )

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      if (e.key === 'ArrowRight') step(1)
      if (e.key === 'ArrowLeft') step(-1)
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [isOpen, close, step])

  if (photos.length === 0) {
    return (
      <p className="rounded-xl bg-brand-stone p-8 text-center text-sm text-brand-grey-light">
        Photos will appear here once they are added by the committee.
      </p>
    )
  }

  const current = index !== null ? photos[index] : null

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {photos.map((p, i) => (
          <li
            key={p.id}
            className={cn(
              'group relative overflow-hidden rounded-xl bg-brand-stone',
              // Feature the first photo and every seventh after it to break the rhythm.
              i % 7 === 0 && 'col-span-2 row-span-2'
            )}
          >
            <button
              type="button"
              onClick={() => setIndex(i)}
              aria-label={p.caption ? `View photo: ${p.caption}` : `View photo ${i + 1}`}
              className="block h-full w-full cursor-pointer focus:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-brand-gold"
            >
              <img
                src={p.url}
                alt={p.caption || 'Lang Lang Cricket Club'}
                loading={i < 8 ? 'eager' : 'lazy'}
                className="aspect-square h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
              />
              <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-brand-black/70 via-transparent to-transparent opacity-0 transition duration-300 group-hover:opacity-100 group-focus-within:opacity-100" />
              <span className="pointer-events-none absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-brand-black opacity-0 shadow transition duration-300 group-hover:opacity-100 group-focus-within:opacity-100">
                <Maximize2 className="h-4 w-4" aria-hidden />
              </span>
              {p.caption && (
                <span className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-2 p-3 text-left text-sm font-medium text-white opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
                  {p.caption}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      {current && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={current.caption || 'Photo viewer'}
          className="fixed inset-0 z-50 flex items-center justify-center bg-brand-black/95 p-4 backdrop-blur-sm animate-in fade-in-0 duration-150"
          onClick={close}
        >
          <button
            type="button"
            onClick={close}
            aria-label="Close photo viewer"
            className="absolute right-4 top-4 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-brand-gold hover:text-brand-black focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold focus-visible:ring-offset-2 focus-visible:ring-offset-brand-black"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>

          {photos.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  step(-1)
                }}
                aria-label="Previous photo"
                className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-brand-gold hover:text-brand-black focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold focus-visible:ring-offset-2 focus-visible:ring-offset-brand-black sm:left-6"
              >
                <ChevronLeft className="h-6 w-6" aria-hidden />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  step(1)
                }}
                aria-label="Next photo"
                className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-brand-gold hover:text-brand-black focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold focus-visible:ring-offset-2 focus-visible:ring-offset-brand-black sm:right-6"
              >
                <ChevronRight className="h-6 w-6" aria-hidden />
              </button>
            </>
          )}

          <figure
            className="flex max-h-full max-w-6xl flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              key={current.id}
              src={current.url}
              alt={current.caption || 'Lang Lang Cricket Club'}
              className="max-h-[80vh] w-auto max-w-full rounded-lg object-contain shadow-2xl animate-in fade-in-0 zoom-in-95 duration-200"
            />
            <figcaption className="mt-4 flex flex-wrap items-center justify-center gap-3 px-2 text-center text-sm text-white/85">
              {current.caption && <span>{current.caption}</span>}
              <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs tabular-nums text-white/85">
                {index! + 1} / {photos.length}
              </span>
            </figcaption>
          </figure>
        </div>
      )}
    </>
  )
}
