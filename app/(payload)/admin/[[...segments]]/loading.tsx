/**
 * The admin's first paint (wave G WP-0): a calm skeleton that streams before Payload has finished resolving the page, so a hard load
 * is never a blank screen. Pure markup and CSS: no data, no client script, and colours only from the `--brand-*` variables that the
 * layout already set on <html> (see `.admin-skel` in payload/components/admin.css). `data-admin-skeleton="shell"` is the marker the
 * streaming check looks for.
 */
export default function Loading() {
  return (
    <div className="admin-skel" data-admin-skeleton="shell" role="status" aria-live="polite" aria-busy="true">
      <span className="admin-skel__sr">Loading the admin</span>
      <aside className="admin-skel__nav" aria-hidden="true">
        <span className="admin-skel__crest" />
        <span className="admin-skel__bar admin-skel__bar--wide" />
        {Array.from({ length: 6 }, (_, i) => <span key={i} className="admin-skel__bar" />)}
      </aside>
      <div className="admin-skel__main" aria-hidden="true">
        <span className="admin-skel__bar admin-skel__bar--title" />
        <span className="admin-skel__bar admin-skel__bar--wide" />
        <div className="admin-skel__cards">
          {Array.from({ length: 4 }, (_, i) => <span key={i} className="admin-skel__card" />)}
        </div>
      </div>
    </div>
  )
}
