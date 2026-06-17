import NextAuth, { type DefaultSession, type NextAuthResult } from 'next-auth';
import type { Provider } from 'next-auth/providers';
import { PrismaAdapter } from '@auth/prisma-adapter';
import Google from 'next-auth/providers/google';
import Resend from 'next-auth/providers/resend';

import { prisma } from '@saas/db';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
    } & DefaultSession['user'];
  }
}

// Providers are added conditionally so the app boots even when a given
// provider's env vars are missing — handy in fresh clones before secrets are
// filled in. The sign-in page only renders buttons for configured providers.
const providers: Provider[] = [];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  );
}

if (process.env.AUTH_RESEND_KEY) {
  providers.push(
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: process.env.EMAIL_FROM ?? 'onboarding@resend.dev',
    }),
  );
}

export const { handlers, signIn, signOut, auth }: NextAuthResult = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers,
  session: {
    strategy: 'database',
    // 90 days. Each request within updateAge (24h, default) slides the expiry
    // back out to 90d, so active users effectively never get signed out. The
    // mobile bridge reads this same DB session row, so this one setting drives
    // both web and mobile session lifetime.
    maxAge: 60 * 60 * 24 * 90,
  },
  pages: {
    // The root route is the login page; unauthenticated visits to protected
    // routes bounce here.
    signIn: '/',
    verifyRequest: '/?check-email=1',
  },
  callbacks: {
    session({ session, user }) {
      // Expose the DB user id on the session so server components and tRPC
      // procedures can authorize without a second lookup.
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
});
