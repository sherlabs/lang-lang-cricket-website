/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      // One canonical host for search engines: www and the production vercel.app
      // alias 308 to the apex domain. Preview deployments use other hosts, so they're untouched.
      // /api/* is excluded: Vercel Cron and Blob upload callbacks may hit the vercel.app host
      // and must not be bounced through a redirect.
      ...['www.langlangcricketclub.com', 'lang-lang-cricket-website.vercel.app'].map((host) => ({
        source: '/:path((?!api/).*)',
        has: [{ type: 'host', value: host }],
        destination: 'https://langlangcricketclub.com/:path',
        permanent: true,
      })),
      // Players moved out of History to their own top-level section.
      { source: '/history/players', destination: '/players', permanent: true },
      { source: '/history/players/:slug', destination: '/players/:slug', permanent: true },
    ]
  },
};

export default nextConfig;
