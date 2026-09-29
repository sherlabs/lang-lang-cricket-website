/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      // Players moved out of History to their own top-level section.
      { source: '/history/players', destination: '/players', permanent: true },
      { source: '/history/players/:slug', destination: '/players/:slug', permanent: true },
    ]
  },
};

export default nextConfig;
