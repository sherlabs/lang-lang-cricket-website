import { configDefaults, defineConfig } from 'vitest/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { intTestEnv } from './tests/int/env'

const root = path.dirname(fileURLToPath(import.meta.url))

const shared = {
  resolve: {
    alias: {
      '@payload-config': path.resolve(root, 'payload.config.ts'),
      // Next resolves this to an empty module under the react-server condition; vitest does not.
      'server-only': path.resolve(root, 'node_modules/server-only/empty.js'),
      '@': root,
    },
  },
}

// Matched against resolved file paths (node_modules/.pnpm/...), so no ^ anchor. Inlining lets
// vi.mock reach the modules these packages import (e.g. the storage plugin's own @vercel/blob).
const server = { deps: { inline: [/@payloadcms\//, /node_modules\/payload\//, /@vercel\/blob/] } }

export default defineConfig({
  test: {
    projects: [
      {
        ...shared,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
          // Agent worktrees under .claude/ carry their own copies of tests/.
          exclude: [...configDefaults.exclude, '.claude/**', 'tests/int/**', 'tests/_pending/**'],
          server,
        },
      },
      {
        ...shared,
        test: {
          name: 'int',
          environment: 'node',
          include: ['tests/int/**/*.int.test.ts'],
          exclude: [...configDefaults.exclude, '.claude/**'],
          globalSetup: ['tests/int/setup.ts'],
          env: intTestEnv(),
          // One file at a time against the shared test DB.
          pool: 'forks',
          poolOptions: { forks: { singleFork: true, isolate: true } },
          testTimeout: 60_000,
          hookTimeout: 120_000,
          server,
        },
      },
    ],
  },
})
