import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { vercelBlobStorage } from '@payloadcms/storage-vercel-blob'
import path from 'path'
import { buildConfig } from 'payload'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

import { assertLocalDb, assertSafeEnv, blobToken, csrfOrigins, requireEnv, resolveServerURL } from './payload/env'
import { Media } from './payload/collections/Media'
import { Users } from './payload/collections/Users'
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
  },
  graphQL: { disable: true },
  collections: [Users, Media],
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
        },
      }),
    ),
  ],
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
})
