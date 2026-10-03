import type { DefaultServerCellComponentProps } from 'payload'

/**
 * `events` list columns (ui fields with `admin.components.Cell`, spec §9). Server cells: each
 * row is one `payload.count`, so the browser makes no request per row. Semantics match commit
 * 0555d48: "going" counts only `yes` answers, across all occurrences.
 */
async function countFor(props: DefaultServerCellComponentProps, collection: 'event-rsvps' | 'event-photos', field: 'response' | 'status', value: string) {
  const id = props.rowData?.id
  if (typeof id !== 'number') return null
  try {
    const { totalDocs } = await props.payload.count({
      collection,
      where: { and: [{ event: { equals: id } }, { [field]: { equals: value } }] },
      overrideAccess: true,
    })
    return totalDocs
  } catch {
    return null
  }
}

export async function RsvpCountCell(props: DefaultServerCellComponentProps) {
  const n = await countFor(props, 'event-rsvps', 'response', 'yes')
  return <span className="club-count-cell">{n ?? '–'}</span>
}

export async function PendingCountCell(props: DefaultServerCellComponentProps) {
  const n = await countFor(props, 'event-photos', 'status', 'pending')
  return <span className={`club-count-cell${n ? ' club-count-cell--alert' : ''}`}>{n ?? '–'}</span>
}
