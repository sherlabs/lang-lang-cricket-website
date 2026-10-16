import type { PayloadRequest } from 'payload'
import { isAdminUser, isStaffUser } from '../../payload/access'
import { decideOfficeBearer, type SeatTerm } from './meetings'

/**
 * `isOfficeBearer(user, req)` (wave D spec 6.2): async, fails closed on any error. An active admin always qualifies; an active
 * editor qualifies while a seat marked office-bearer names their login and its term has not ended. Selectors never do.
 *
 * Access functions run on every document read and list, so the answer is memoised for the life of one request (keyed by the `req`
 * object and the user id). It is never kept across requests, so a handover takes effect on the next request. The seat lookup uses
 * `overrideAccess` so asking "is this person an office-bearer" can never recurse into the seats' own access rule.
 */
const memo = new WeakMap<object, Map<number, Promise<boolean>>>()
/** Counts seat lookups; tests read it to prove "one lookup for many calls in a request". */
export const officeBearerLookups = { count: 0 }

type UserLike = { id?: unknown; role?: unknown; disabled?: unknown } | null | undefined

export async function seatTermsFor(req: Pick<PayloadRequest, 'payload'> & Partial<PayloadRequest>, userId: number): Promise<SeatTerm[]> {
  officeBearerLookups.count++
  const res = await req.payload.find({
    collection: 'committee-seats',
    where: { and: [{ holderUser: { equals: userId } }, { officeBearer: { equals: true } }] },
    pagination: false,
    depth: 0,
    overrideAccess: true,
    select: { holderUser: true, officeBearer: true, termEnd: true },
    req: req as PayloadRequest,
  })
  return (res.docs as unknown as { holderUser?: number | { id: number } | null; officeBearer?: boolean | null; termEnd?: string | null }[]).map((s) => ({
    holderUserId: typeof s.holderUser === 'object' && s.holderUser ? s.holderUser.id : (s.holderUser ?? null),
    officeBearer: Boolean(s.officeBearer),
    termEnd: s.termEnd ?? null,
  }))
}

export async function isOfficeBearer(user: UserLike, req: Pick<PayloadRequest, 'payload'> & Partial<PayloadRequest>): Promise<boolean> {
  try {
    if (isAdminUser(user)) return true
    if (!isStaffUser(user) || user?.role !== 'editor' || typeof user.id !== 'number') return false
    const id = user.id
    let perUser = memo.get(req)
    if (!perUser) memo.set(req, (perUser = new Map()))
    let answer = perUser.get(id)
    if (!answer) {
      answer = seatTermsFor(req, id).then((seats) => decideOfficeBearer(user, seats, new Date()))
      // A failed lookup is not remembered as "no"; the caller below still fails closed.
      answer.catch(() => perUser!.delete(id))
      perUser.set(id, answer)
    }
    return await answer
  } catch {
    return false
  }
}
