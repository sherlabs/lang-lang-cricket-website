import { Skeleton } from '@/payload/components/ui/Skeleton'

/**
 * The admin's first paint (wave G WP-0): a calm skeleton that streams before Payload has finished resolving the page, so a hard load
 * is never a blank screen. Pure markup and CSS: no data, no client script, and colours only from the theme variables that the
 * layout already set on <html> (see `.admin-skel` in payload/components/admin.css). It has the proportions of the real shell (a
 * sidebar with the crest, a page header, a row of cards) so the page does not jump when it arrives. `data-admin-skeleton="shell"`
 * is the marker the streaming check looks for.
 */
export default function Loading() {
  return (
    <div className="admin-skel" data-admin-skeleton="shell" role="status" aria-live="polite" aria-busy="true">
      <span className="admin-skel__sr">Loading the admin</span>
      <aside className="admin-skel__nav" aria-hidden="true">
        <span className="admin-skel__crest" />
        <Skeleton width="90%" height="0.9rem" />
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} width="70%" height="0.9rem" />
        ))}
      </aside>
      <div className="admin-skel__main" aria-hidden="true">
        <Skeleton width="12rem" height="1.75rem" />
        <Skeleton width="90%" height="0.9rem" />
        <div className="admin-skel__cards">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} height="7rem" />
          ))}
        </div>
      </div>
    </div>
  )
}
