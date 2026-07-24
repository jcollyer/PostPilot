/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages are TypeScript source — let Next compile them.
  transpilePackages: ['@saas/api', '@saas/db', '@saas/types'],
  // tRPC + superjson on RSC works best with Prisma treated as external.
  serverExternalPackages: ['@prisma/client'],
  images: {
    remotePatterns: [
      {
        // Allow Google account profile photos used as avatars.
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
  async redirects() {
    return [
      {
        // Permanent (301) redirect: www.post-pilot.app -> post-pilot.app,
        // preserving the path/query so deep links keep working.
        source: '/:path*',
        has: [{ type: 'host', value: 'www.post-pilot.app' }],
        destination: 'https://post-pilot.app/:path*',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
