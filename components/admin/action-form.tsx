'use client'

import { createContext, useContext, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Provided by EditDialog so a form inside it can close it after saving. */
export const DialogCloseContext = createContext<(() => void) | null>(null)
export const useDialogClose = () => useContext(DialogCloseContext)

export function SubmitButton({
  children,
  pendingText = 'Saving…',
  variant = 'brand',
  className,
  ...props
}: React.ComponentProps<typeof Button> & { pendingText?: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="xl" variant={variant} disabled={pending} className={className} {...props}>
      {pending ? pendingText : children}
    </Button>
  )
}

type Props = {
  action: (formData: FormData) => Promise<void>
  /** Reset the fields after a successful submit (add forms). */
  resetOnSuccess?: boolean
  successText?: string
  className?: string
  children: React.ReactNode
}

/**
 * A form that posts to a server action, reports pending/success/error inline,
 * refreshes the page data afterwards and closes its dialog if it lives in one.
 */
export function ActionForm({ action, resetOnSuccess, successText, className, children }: Props) {
  const router = useRouter()
  const close = useDialogClose()
  const formRef = useRef<HTMLFormElement>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  async function submit(formData: FormData) {
    setMessage(null)
    try {
      await action(formData)
      if (resetOnSuccess) formRef.current?.reset()
      if (successText) setMessage({ tone: 'ok', text: successText })
      router.refresh()
      close?.()
    } catch (err) {
      setMessage({ tone: 'error', text: (err as Error).message || 'Something went wrong. Try again.' })
    }
  }

  return (
    <form ref={formRef} action={submit} className={cn('flex flex-col gap-4', className)}>
      {children}
      {message && (
        <p role="status" className={cn('text-sm', message.tone === 'error' ? 'text-red-700' : 'text-brand-gold-deep')}>
          {message.text}
        </p>
      )}
    </form>
  )
}
