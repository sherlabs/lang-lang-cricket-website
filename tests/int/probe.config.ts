/**
 * Test-only Payload config for the WP1 verification items (spec §7.6, §18 WP1).
 * Same Users/Media/plugin wiring as payload.config.ts, plus throwaway probe
 * collections (resizeOptions, an array field, a join) in their own schema
 * `probe` of the local *_test DB, created by push.
 */
import { postgresAdapter } from '@payloadcms/db-postgres'
import { vercelBlobStorage } from '@payloadcms/storage-vercel-blob'
import { buildConfig } from 'payload'
import sharp from 'sharp'
import { blobToken } from '../../payload/env'
import { Media } from '../../payload/collections/Media'
import { Users } from '../../payload/collections/Users'
import { guardLegacyBlobDeletes } from '../../payload/plugins/guardLegacyBlobDeletes'
import { assertTestDb } from './env'

assertTestDb(process.env.DATABASE_URI)

export default buildConfig({
  serverURL: 'http://localhost:3000',
  csrf: ['http://localhost:3000'],
  secret: 'probe-secret',
  graphQL: { disable: true },
  admin: { user: 'users' },
  collections: [
    Users,
    Media,
    {
      slug: 'resize-probe',
      access: { read: () => true },
      upload: {
        mimeTypes: ['image/*'],
        filesRequiredOnCreate: false,
        resizeOptions: { width: 40, height: 40, fit: 'inside', withoutEnlargement: true },
      },
      fields: [],
    },
    {
      slug: 'plain-probe',
      access: { read: () => true },
      upload: { mimeTypes: ['image/*'], filesRequiredOnCreate: false },
      fields: [],
    },
    {
      slug: 'array-probe',
      fields: [{ name: 'honours', type: 'array', fields: [{ name: 'title', type: 'text' }] }],
    },
    {
      slug: 'join-parents',
      access: { read: () => true },
      fields: [
        { name: 'title', type: 'text' },
        { name: 'children', type: 'join', collection: 'join-children' as never, on: 'parent' },
      ],
    },
    {
      slug: 'join-children',
      access: { read: () => true },
      fields: [
        { name: 'parent', type: 'relationship', relationTo: 'join-parents' as never, required: true },
        { name: 'status', type: 'select', options: ['pending', 'approved'] },
      ],
    },
  ],
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URI },
    schemaName: 'probe',
    push: true,
  }),
  sharp,
  plugins: [
    guardLegacyBlobDeletes(
      vercelBlobStorage({
        enabled: Boolean(blobToken()),
        token: blobToken(),
        clientUploads: true,
        alwaysInsertFields: true,
        collections: {
          media: { prefix: '', disablePayloadAccessControl: true },
          'resize-probe': { prefix: 'probe', disablePayloadAccessControl: true },
          'plain-probe': { prefix: 'plain', disablePayloadAccessControl: true },
        } as never, // probe slugs are not in the generated CollectionSlug union
      }),
    ),
  ],
})
