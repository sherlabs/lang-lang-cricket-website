import { forwardRef } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

const control =
  'h-11 w-full rounded-lg border border-brand-black/15 bg-white px-3 text-base text-brand-black placeholder:text-brand-grey-light md:text-sm'

/** Label + control + optional hint. Give the control an `id` that matches `htmlFor`. */
export function Field({
  label,
  htmlFor,
  hint,
  className,
  children,
}: {
  label: string
  htmlFor: string
  hint?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={htmlFor} className="text-brand-black">
        {label}
      </Label>
      {children}
      {hint && <p className="text-xs leading-relaxed text-brand-grey">{hint}</p>}
    </div>
  )
}

export function TextInput({ className, ...props }: React.ComponentProps<typeof Input>) {
  return <Input className={cn(control, className)} {...props} />
}

export function TextArea({ className, ...props }: React.ComponentProps<typeof Textarea>) {
  return <Textarea className={cn(control, 'h-auto min-h-24 py-2', className)} {...props} />
}

export function Select({ className, ...props }: React.ComponentProps<'select'>) {
  return <select className={cn(control, 'appearance-auto pr-8', className)} {...props} />
}

export const FileInput = forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(function FileInput(
  { className, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      type="file"
      className={cn(
        'block w-full rounded-lg border border-dashed border-brand-black/20 bg-brand-stone/60 px-3 py-2 text-sm text-brand-grey',
        'file:mr-3 file:min-h-7 file:rounded-md file:border-0 file:bg-brand-black file:px-3 file:text-xs file:font-semibold file:text-white',
        className
      )}
      {...props}
    />
  )
})
