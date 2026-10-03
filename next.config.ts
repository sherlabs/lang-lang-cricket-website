import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertSafeEnv } from './payload/env'

// Refuse to start `next dev/start/build` at all with a remote DB or a Blob token
// off Vercel (payload.config.ts repeats this for the CLI and scripts).
assertSafeEnv()

const dirname = path.dirname(fileURLToPath(import.meta.url))

const canonical = process.env.CANONICAL_HOST ?? 'langlangcricketclub.com'
const redirectHosts = (process.env.REDIRECT_HOSTS ?? 'www.langlangcricketclub.com,lang-lang-cricket-website.vercel.app')
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean)

const nextConfig: NextConfig = {
  turbopack: { root: dirname },
  // Next writes AGENTS.md/CLAUDE.md on dev start otherwise.
  agentRules: false,
  experimental: { globalNotFound: true },
  // The club logo (club global) may be a Blob URL; next/image needs the host allowed.
  images: { remotePatterns: [{ protocol: 'https', hostname: '*.public.blob.vercel-storage.com' }] },
  async redirects() {
    return [
      // One canonical host for search engines: www and the production vercel.app
      // alias 308 to the apex domain. Preview deployments use other hosts, so they're untouched.
      // /api/* is excluded: Vercel Cron and Blob upload callbacks may hit the vercel.app host
      // and must not be bounced through a redirect.
      ...redirectHosts.map((host) => ({
        source: '/:path((?!api/).*)',
        has: [{ type: 'host' as const, value: host }],
        destination: `https://${canonical}/:path`,
        permanent: true,
      })),
      // Players moved out of History to their own top-level section.
      { source: '/history/players', destination: '/players', permanent: true },
      { source: '/history/players/:slug', destination: '/players/:slug', permanent: true },
    ]
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
