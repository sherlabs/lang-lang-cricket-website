import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_CANONICAL_HOST } from './config/site'
import { assertSafeEnv } from './payload/env'

// Refuse to start `next dev/start/build` at all with a remote DB or a Blob token
// off Vercel (payload.config.ts repeats this for the CLI and scripts).
assertSafeEnv()

const dirname = path.dirname(fileURLToPath(import.meta.url))

const canonical = process.env.CANONICAL_HOST ?? DEFAULT_CANONICAL_HOST
const redirectHosts = (process.env.REDIRECT_HOSTS ?? 'www.langlangcricketclub.com,lang-lang-cricket-website.vercel.app')
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean)

const nextConfig: NextConfig = {
  // No X-Powered-By anywhere (withPayload would otherwise send "Next.js, Payload" on every path).
  poweredByHeader: false,
  turbopack: { root: dirname },
  // Next writes AGENTS.md/CLAUDE.md on dev start otherwise.
  agentRules: false,
  experimental: { globalNotFound: true },
  // The stat card reads the bundled crest from disk at render time (the font ships inside next/og).
  outputFileTracingIncludes: { '/api/public/players/[slug]/card': ['./public/assets/branding/logo.png'] },
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

const withPayloadConfig = withPayload(nextConfig, { devBundleServerPackages: false })
const payloadHeaders = withPayloadConfig.headers

/**
 * withPayload adds a `/:path*` rule with Accept-CH / Vary / Critical-CH: Sec-CH-Prefers-Color-Scheme
 * for the admin theme. On the public site it adds a Critical-CH restart round trip and splits
 * CDN/ISR cache entries by colour scheme, so it is scoped to the admin only.
 */
export default {
  ...withPayloadConfig,
  async headers() {
    const rules = payloadHeaders ? await payloadHeaders() : []
    return rules.map((rule) =>
      rule.source === '/:path*' && rule.headers.some((h) => h.key === 'Critical-CH') ? { ...rule, source: '/admin/:path*' } : rule,
    )
  },
} satisfies NextConfig

