import 'server-only'
import path from 'node:path'
import type { Payload } from 'payload'
import type { Media } from '@/payload-types'
import { loadLogoDataUri } from '../logo'
import { LOGO_ERROR_TEXT, type LogoResult } from '../logo-core'

/** The directory the `media` collection stores uploads in (from its own config, never a guessed path). */
export function mediaDir(payload: Payload): string {
  const dir = payload.collections.media?.config.upload && typeof payload.collections.media.config.upload === 'object' ? payload.collections.media.config.upload.staticDir : undefined
  return dir ? path.resolve(dir) : path.resolve(process.cwd(), 'media')
}

/** The sponsor's `logo` upload as a PNG data URI, or why it cannot be drawn. `none` is a sponsor with no logo at all. */
export async function sponsorLogo(payload: Payload, logo: Media | number | null | undefined): Promise<LogoResult | { error: 'none' }> {
  if (typeof logo !== 'object' || logo === null) return { error: 'none' }
  return loadLogoDataUri({ id: logo.id, updatedAt: logo.updatedAt, filename: logo.filename, url: logo.url }, { staticDir: mediaDir(payload) })
}

export const logoReason = (r: LogoResult | { error: 'none' }): string => ('error' in r && r.error !== 'none' ? LOGO_ERROR_TEXT[r.error] : '')
