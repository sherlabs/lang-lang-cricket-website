import { configDefaults, defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    // Agent worktrees under .claude/ carry their own copies of tests/.
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
