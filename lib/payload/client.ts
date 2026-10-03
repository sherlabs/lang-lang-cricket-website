import 'server-only'
import config from '@payload-config'
import { getPayload } from 'payload'
import { cache } from 'react'

/**
 * The Local API for server components, route handlers and actions (spec §14).
 * NOTE: the Local API defaults to `overrideAccess: true`, so every public query states its
 * own `where` (published / approved / not hidden).
 */
export const getPayloadClient = cache(() => getPayload({ config }))
