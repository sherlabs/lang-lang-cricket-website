'use client'

import { useSyncExternalStore } from 'react'

const subscribe = () => () => undefined

/**
 * False on the server and during hydration, true once the page's script has taken over. Controls use it to be `disabled` (with a
 * skeleton or "busy" state) instead of looking live while nothing is attached to them yet. React switches from the server value to
 * the client value after hydration without a mismatch warning.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false)
}
