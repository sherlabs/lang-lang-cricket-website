import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      '.claude/**',
      'next-env.d.ts',
      'payload-types.ts',
      'app/(payload)/admin/importMap.js',
      'payload/migrations/**',
      'payload/components/_source/**',
    ],
  },
]

export default eslintConfig
