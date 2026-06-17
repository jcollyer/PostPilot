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
};

export default nextConfig;
