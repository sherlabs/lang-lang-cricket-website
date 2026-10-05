import type { TypedUser } from 'payload'
import { isSelectionUser } from '@/payload/access'

/** Every privileged `lib/selector-*` function starts here: it re-checks the role itself instead of trusting its caller. */
export function assertSelection(user: TypedUser | null | undefined): asserts user is TypedUser {
  if (!isSelectionUser(user)) throw new Error('Selector access is required.')
}
