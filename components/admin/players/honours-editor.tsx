'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { HugeiconsIcon } from '@hugeicons/react'
import { Add01Icon, ArrowDown01Icon, ArrowUp01Icon, Delete02Icon } from '@hugeicons/core-free-icons'
import { saveHonours, type HonourInput } from '@/app/admin/(shell)/players/actions'
import { TextInput } from '@/components/admin/fields'
import { Button } from '@/components/ui/button'

type Row = HonourInput & { key: number }

const iconButton = 'min-h-11 min-w-11 text-brand-grey hover:text-brand-black'

/** Ordered list of honours / roles (e.g. "2019–22 · Club Captain"), saved as a whole. */
export function HonoursEditor({ playerId, initial }: { playerId: number; initial: HonourInput[] }) {
  const router = useRouter()
  const nextKey = useRef(initial.length)
  const [rows, setRows] = useState<Row[]>(() => initial.map((h, i) => ({ years: h.years, title: h.title, key: i })))
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  function update(key: number, patch: Partial<HonourInput>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
    setStatus(null)
  }
  function move(index: number, delta: -1 | 1) {
    setRows((rs) => {
      const to = index + delta
      if (to < 0 || to >= rs.length) return rs
      const next = [...rs]
      ;[next[index], next[to]] = [next[to], next[index]]
      return next
    })
    setStatus(null)
  }
  function remove(key: number) {
    setRows((rs) => rs.filter((r) => r.key !== key))
    setStatus(null)
  }
  function add() {
    setRows((rs) => [...rs, { years: '', title: '', key: nextKey.current++ }])
    setStatus(null)
  }

  async function save() {
    setBusy(true)
    setStatus(null)
    try {
      await saveHonours(
        playerId,
        rows.map(({ years, title }) => ({ years, title }))
      )
      setStatus({ tone: 'ok', text: 'Honours saved.' })
      router.refresh()
    } catch (err) {
      setStatus({ tone: 'error', text: (err as Error).message || 'Could not save honours. Try again.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {rows.length === 0 ? (
        <p className="text-sm text-brand-grey">No honours yet. Add captaincies, awards, life membership and so on.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {rows.map((r, i) => (
            <li
              key={r.key}
              className="flex flex-col gap-2 rounded-xl bg-brand-stone/50 p-3 ring-1 ring-brand-black/5 sm:flex-row sm:items-center"
            >
              <div className="grid flex-1 gap-2 sm:grid-cols-[9rem_1fr]">
                <TextInput
                  aria-label={`Honour ${i + 1} years`}
                  placeholder="Years, e.g. 2019–22"
                  value={r.years}
                  onChange={(e) => update(r.key, { years: e.target.value })}
                />
                <TextInput
                  aria-label={`Honour ${i + 1} title`}
                  placeholder="Title, e.g. Club Captain"
                  value={r.title}
                  onChange={(e) => update(r.key, { title: e.target.value })}
                />
              </div>
              <div className="flex items-center justify-end gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={iconButton}
                  aria-label="Move up"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <HugeiconsIcon icon={ArrowUp01Icon} className="h-4 w-4" aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={iconButton}
                  aria-label="Move down"
                  disabled={i === rows.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <HugeiconsIcon icon={ArrowDown01Icon} className="h-4 w-4" aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="min-h-11 min-w-11 text-red-700 hover:bg-red-50 hover:text-red-800"
                  aria-label="Remove"
                  onClick={() => remove(r.key)}
                >
                  <HugeiconsIcon icon={Delete02Icon} className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="xl" onClick={add} disabled={busy}>
          <HugeiconsIcon icon={Add01Icon} className="h-4 w-4" aria-hidden />
          Add honour
        </Button>
        <Button type="button" variant="brand" size="xl" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save honours'}
        </Button>
        {status && (
          <p role="status" className={status.tone === 'error' ? 'text-sm text-red-700' : 'text-sm text-brand-gold-deep'}>
            {status.text}
          </p>
        )}
      </div>
      <p className="text-xs text-brand-grey">Rows without a title are dropped when you save.</p>
    </div>
  )
}
