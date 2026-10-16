import type { Payload } from 'payload'
import { isStaff } from './index'

/**
 * Payload's built-in collections default to "any logged-in user" (`payload-locked-documents` for sure). With a selector role that
 * would let a selector create and read edit locks, so the committee-only rule is applied once the config is sanitised (the built-ins
 * are added during sanitising and cannot be declared in the config). `payload-preferences` already limits every row to its owner and
 * `payload-jobs` is off (no tasks) and all-deny. A matrix test (`tests/int/selector-matrix.int.test.ts`) pins the result.
 */
export function restrictBuiltinCollections(payload: Payload): void {
  for (const collection of payload.config.collections) {
    if (collection.slug === 'payload-locked-documents') {
      collection.access = { ...collection.access, create: isStaff, read: isStaff, update: isStaff, delete: isStaff }
    }
  }
}
