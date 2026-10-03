import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { vercelBlobStorage } from '@payloadcms/storage-vercel-blob'
import path from 'path'
import { buildConfig } from 'payload'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

import { assertLocalDb, assertSafeEnv, blobToken, csrfOrigins, requireEnv, resolveServerURL } from './payload/env'
import { Announcements } from './payload/collections/Announcements'
import { Documents } from './payload/collections/Documents'
import { EventPhotos } from './payload/collections/EventPhotos'
import { EventRsvps } from './payload/collections/EventRsvps'
import { Events } from './payload/collections/Events'
import { GalleryPhotos } from './payload/collections/GalleryPhotos'
import { Media } from './payload/collections/Media'
import { People } from './payload/collections/People'
import { PlayerAliases } from './payload/collections/PlayerAliases'
import { Players } from './payload/collections/Players'
import { PlayerSeasons } from './payload/collections/PlayerSeasons'
import { PlayerSyncRuns } from './payload/collections/PlayerSyncRuns'
import { Sponsors } from './payload/collections/Sponsors'
import { Stories } from './payload/collections/Stories'
import { Users } from './payload/collections/Users'
import { Club } from './payload/globals/Club'
import { SiteSettings } from './payload/globals/SiteSettings'
import { guardLegacyBlobDeletes } from './payload/plugins/guardLegacyBlobDeletes'

// First statement: every entry point (next dev/start/build, the payload CLI incl.
// migrate:fresh/down, `payload run` scripts, tests) loads this file.
assertSafeEnv()

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const serverURL = resolveServerURL()
const token = blobToken()

export default buildConfig({
  serverURL,
  // Explicit: an empty list would disable the Origin check on cookie auth.
  csrf: csrfOrigins(serverURL),
  secret: requireEnv('PAYLOAD_SECRET'),
  admin: {
    user: Users.slug,
    importMap: { baseDir: path.resolve(dirname) },
    meta: { titleSuffix: ' — Club admin' },
    components: {
      graphics: { Logo: '/payload/components/Logo#Logo', Icon: '/payload/components/Icon#Icon' },
      beforeDashboard: ['/payload/components/Dashboard#Dashboard'],
    },
  },
  graphQL: { disable: true },
  collections: [Users, Media, Documents, GalleryPhotos, Sponsors, People, Announcements, Events, EventRsvps, EventPhotos, Stories, Players, PlayerAliases, PlayerSeasons, PlayerSyncRuns],
  globals: [Club, SiteSettings],
  editor: lexicalEditor(),
  db: postgresAdapter({
    pool: {
      connectionString: requireEnv('DATABASE_URI'),
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    },
    schemaName: 'payload',
    // Opt-in, dev only, local only (assertLocalDb throws for a remote host).
    push: process.env.NODE_ENV !== 'production' && process.env.PAYLOAD_PUSH === 'true' && assertLocalDb(),
    migrationDir: path.resolve(dirname, 'payload/migrations'),
    // ETL only (spec §12.3): the running app never accepts client-chosen ids.
    allowIDOnCreate: process.env.PAYLOAD_ETL === 'true',
  }),
  sharp,
  plugins: [
    guardLegacyBlobDeletes(
      vercelBlobStorage({
        enabled: Boolean(token),
        token,
        clientUploads: true,
        // Same schema (prefix/_objectKey columns) with or without a token.
        alwaysInsertFields: true,
        collections: {
          // MUST be '' — any other collection prefix nests per-row prefixes (spec §1).
          media: { prefix: '', disablePayloadAccessControl: true },
          documents: { prefix: 'documents', disablePayloadAccessControl: true },
          'gallery-photos': { prefix: 'gallery', disablePayloadAccessControl: true },
          'event-photos': { prefix: 'events', disablePayloadAccessControl: true },
        },
      }),
    ),
  ],
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
})
