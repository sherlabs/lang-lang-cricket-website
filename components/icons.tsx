import type { SVGProps } from 'react'

/** Facebook "f" glyph — lucide no longer ships brand icons. */
export function FacebookIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      focusable="false"
      {...props}
    >
      <path d="M13.5 22v-8.2h2.8l.4-3.3h-3.2V8.4c0-.9.3-1.6 1.6-1.6h1.7v-3c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.5H7.3v3.3h2.8V22h3.4z" />
    </svg>
  )
}
