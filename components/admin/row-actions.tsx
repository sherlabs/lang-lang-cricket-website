'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { HugeiconsIcon } from '@hugeicons/react'
import { Delete02Icon, PencilEdit01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DialogCloseContext } from './action-form'

const dialogClass = 'max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 text-brand-black shadow-card-hover ring-brand-black/10 sm:max-w-lg'

/** "Edit" button that opens a dialog. Put an ActionForm (or any form using useDialogClose) inside. */
export function EditDialog({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" variant="outline" size="sm" className="min-h-11 gap-1.5" onClick={() => setOpen(true)}>
        <HugeiconsIcon icon={PencilEdit01Icon} className="h-4 w-4" aria-hidden />
        Edit
      </Button>
      <DialogContent className={dialogClass}>
        <DialogHeader>
          <DialogTitle className="display text-2xl">{title}</DialogTitle>
          {description && <DialogDescription className="text-brand-grey">{description}</DialogDescription>}
        </DialogHeader>
        <DialogCloseContext.Provider value={() => setOpen(false)}>{open && children}</DialogCloseContext.Provider>
      </DialogContent>
    </Dialog>
  )
}

/** "Delete" button with a confirmation dialog. `action` is the server action already bound to the row id. */
export function ConfirmDelete({ name, action }: { name: string; action: () => Promise<void> }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      await action()
      setOpen(false)
      router.refresh()
    } catch (err) {
      setError((err as Error).message || 'Could not delete. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="min-h-11 gap-1.5 text-red-700 hover:bg-red-50 hover:text-red-800"
        onClick={() => setOpen(true)}
      >
        <HugeiconsIcon icon={Delete02Icon} className="h-4 w-4" aria-hidden />
        Delete
      </Button>
      <DialogContent className={dialogClass}>
        <DialogHeader>
          <DialogTitle className="display text-2xl">Delete &lsquo;{name}&rsquo;?</DialogTitle>
          <DialogDescription className="text-brand-grey">This can&apos;t be undone.</DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <DialogFooter className="-mx-6 -mb-6 border-brand-black/5 bg-brand-stone/60 p-6">
          <Button type="button" variant="outline" size="xl" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" variant="danger" size="xl" onClick={confirm} disabled={busy}>
            {busy ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
