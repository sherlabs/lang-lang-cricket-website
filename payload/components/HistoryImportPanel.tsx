'use client'

import { Button, toast } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'

type Issue = { row: number; column: string | null; message: string }
type Preview = {
  fileHash: string
  kind: string
  summary: { create: number; update: number; unchanged: number; errors: number; warnings: number; ignored: number }
  rowErrors: Issue[]
  warnings: Issue[]
  newPlayers: { nameKey: string; firstName: string; lastName: string }[]
  overlaps: Issue[]
}
type Batch = { batch: string; seasons: number; matches: number; at: string }
type Kind = 'season-totals' | 'match-rows'

const KIND_LABEL: Record<Kind, string> = { 'season-totals': 'Season totals (one row per player per team per season)', 'match-rows': 'Match rows (one row per player per game)' }

/**
 * Import and export history (W2 spec 6.1). Choose what the file holds, preview it (nothing is written), fix any problems the
 * preview lists by row, then import. An import can be undone as a whole from the log below.
 */
export function HistoryImportPanel({ api, batches }: { api: string; batches: Batch[] }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [kind, setKind] = useState<Kind>('season-totals')
  const [csv, setCsv] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [createUnknown, setCreateUnknown] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)

  const call = async (path: string, body: unknown) => {
    const res = await fetch(`${api}${path}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (!res.ok) throw new Error((json?.errors as { message: string }[] | undefined)?.[0]?.message ?? `That did not work (${res.status}).`)
    return json as Record<string, unknown>
  }

  const onFile = async (file: File | undefined) => {
    setPreview(null)
    if (!file) return setCsv(null)
    setFileName(file.name)
    setCsv(await file.text())
  }

  const runPreview = async () => {
    if (!csv) return void toast.error('Choose a CSV file first.')
    setBusy(true)
    try {
      setPreview({ ...((await call('/history-import/preview', { kind, csv, createUnknown })) as unknown as Preview) })
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const apply = async () => {
    if (!csv || !preview) return
    setBusy(true)
    try {
      const res = await call('/history-import/apply', { kind, csv, createUnknown, fileHash: preview.fileHash })
      toast.success(`Imported: ${res.created} new, ${res.updated} changed, ${res.unchanged} unchanged.`)
      setPreview(null)
      setCsv(null)
      setFileName('')
      if (fileRef.current) fileRef.current.value = ''
      router.refresh()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const undo = async (b: Batch) => {
    if (!window.confirm(`Remove everything this import brought in (${b.seasons} season rows, ${b.matches} games)? Players it created are kept.`)) return
    setBusy(true)
    try {
      await call('/history-import/undo-batch', { batch: b.batch })
      toast.success('Import removed.')
      router.refresh()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const s = preview?.summary
  const clean = !!preview && preview.rowErrors.length === 0
  return (
    <div className="club-stack">
      <p className="club-muted">
        Older seasons that PlayHQ does not have can be added from a spreadsheet saved as CSV. Imported rows are marked as imported, the nightly PlayHQ update never touches them, and a season PlayHQ already has for a player is refused so nothing is counted twice. Text that starts with = + - @ is refused.
      </p>
      <p>
        Templates:{' '}
        <a href={`${api}/history-import/template/season-totals`}>season totals</a> · <a href={`${api}/history-import/template/match-rows`}>match rows</a>. Export what the site holds now:{' '}
        <a href={`${api}/history-import/export/season-totals`}>season totals</a> · <a href={`${api}/history-import/export/match-rows`}>match rows</a> (includes hidden players: keep the files private).
      </p>
      <div className="club-field">
        <label>
          What does the file hold?{' '}
          <select value={kind} onChange={(e) => { setKind(e.target.value as Kind); setPreview(null) }}>
            {(Object.keys(KIND_LABEL) as Kind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </label>
      </div>
      <div className="club-field">
        <label>
          CSV file <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
      </div>
      <div className="club-field">
        <label>
          <input type="checkbox" checked={createUnknown} onChange={(e) => { setCreateUnknown(e.target.checked); setPreview(null) }} /> Create new players for names that are not on the site yet
        </label>
      </div>
      <div className="club-actions">
        <Button buttonStyle="primary" type="button" disabled={busy || !csv} onClick={runPreview}>{busy ? 'Working…' : 'Preview (nothing is saved)'}</Button>
        <Button buttonStyle="secondary" type="button" disabled={busy || !clean} onClick={apply}>Import {fileName ? `"${fileName}"` : ''}</Button>
      </div>

      {preview && s && (
        <div role="status" className="club-field">
          <h3 className="club-field__title">Preview</h3>
          <p>
            <strong>{s.create}</strong> new, <strong>{s.update}</strong> changed, <strong>{s.unchanged}</strong> unchanged
            {s.ignored ? <>, <strong>{s.ignored}</strong> exported PlayHQ rows skipped</> : null}; <strong>{s.errors}</strong> {s.errors === 1 ? 'problem' : 'problems'}, <strong>{s.warnings}</strong> {s.warnings === 1 ? 'warning' : 'warnings'}.
            {clean ? ' Nothing is wrong, so you can import.' : ' Fix the problems in the spreadsheet and preview again. Nothing has been imported.'}
          </p>
          {preview.rowErrors.length > 0 && <IssueTable title="Problems" issues={preview.rowErrors} />}
          {preview.overlaps.length > 0 && <p className="club-muted">{preview.overlaps.length} {preview.overlaps.length === 1 ? 'row overlaps' : 'rows overlap'} data PlayHQ already has.</p>}
          {preview.warnings.length > 0 && <IssueTable title="Warnings" issues={preview.warnings} />}
          {preview.newPlayers.length > 0 && <p>New players that will be created: {preview.newPlayers.map((p) => `${p.firstName} ${p.lastName}`.trim()).join(', ')}.</p>}
        </div>
      )}

      <h3 className="club-field__title">Imports on the site</h3>
      {batches.length === 0 ? (
        <p className="club-muted">Nothing has been imported yet.</p>
      ) : (
        <table className="club-table">
          <thead><tr><th>When</th><th>Season rows</th><th>Games</th><th aria-label="Actions" /></tr></thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.batch}>
                <td>{new Date(b.at).toLocaleString()}</td>
                <td>{b.seasons}</td>
                <td>{b.matches}</td>
                <td><Button buttonStyle="secondary" size="small" type="button" disabled={busy} onClick={() => undo(b)}>Undo this import</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function IssueTable({ title, issues }: { title: string; issues: Issue[] }) {
  const shown = issues.slice(0, 100)
  return (
    <>
      <h4>{title}</h4>
      <table className="club-table">
        <thead><tr><th>Row</th><th>Column</th><th>What to fix</th></tr></thead>
        <tbody>{shown.map((i, n) => <tr key={`${i.row}-${i.column}-${n}`}><td>{i.row}</td><td>{i.column ?? ''}</td><td>{i.message}</td></tr>)}</tbody>
      </table>
      {issues.length > shown.length && <p className="club-muted">And {issues.length - shown.length} more.</p>}
    </>
  )
}
