import { cx } from './cx'

/** A shimmering placeholder block, sized like the content that will replace it so nothing jumps. Decorative. */
export function Skeleton({ width, height, className }: { width?: string; height?: string; className?: string }) {
  return <span className={cx('ui-skel', className)} style={{ width, height }} aria-hidden="true" />
}

/** A few rows of placeholder text for a region that is still loading, announced once as "Loading". */
export function SkeletonRows({ rows = 3, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div className="ui-skel-rows" role="status" aria-busy="true">
      <span className="ui-sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} width={i === rows - 1 ? '60%' : '100%'} height="1rem" />
      ))}
    </div>
  )
}
