import type { Metadata } from 'next'

export const SITE_URL = 'https://langlangcricketclub.com'
export const SITE_NAME = 'Lang Lang Cricket Club'

// 1200×630, ~125KB: the size link previews expect (WhatsApp drops images over ~300KB).
export const DEFAULT_OG_IMAGE = {
  url: '/og-image.jpg',
  width: 1200,
  height: 630,
  alt: 'Lang Lang Cricket Club clubrooms and oval at Caldermeade',
}

/**
 * Open Graph block shared by every page. No og:title/description here on purpose:
 * Next doesn't derive them from each page's `title`, and a fixed site-wide value
 * made every shared link preview read "Lang Lang Cricket Club". Without them,
 * crawlers fall back to the page's own <title> and meta description.
 * A page that sets its own `openGraph` replaces this object, so spread it in.
 */
export const baseOpenGraph: NonNullable<Metadata['openGraph']> = {
  type: 'website',
  siteName: SITE_NAME,
  locale: 'en_AU',
  images: [DEFAULT_OG_IMAGE],
}
