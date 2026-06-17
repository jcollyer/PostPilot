import { NextResponse } from 'next/server';
import { headers } from 'next/headers';

import { prisma } from '@saas/db';
import { auth } from '@/server/auth';

/**
 * Mobile auth bridge.
 *
 * Flow:
 *   1. Expo app opens an in-app browser at `/auth/mobile?returnUrl=<deeplink>`
 *   2. If there's no Auth.js session cookie, we redirect into the normal
 *      sign-in flow with this URL as the callback so we land back here once
 *      the user is signed in.
 *   3. Once signed in, we look up an active Session row for this user and hand
 *      the session token back to the app via its deep link (`returnUrl`).
 *      The app stores the token in SecureStore and uses it as a bearer token
 *      on every tRPC request.
 *
 * No changes to `@saas/api` — this bridge lives entirely in the Next app.
 */
export async function GET(req: Request) {
  // Behind a proxy (ngrok, Vercel, etc.) `req.url` can reflect the internal
  // origin instead of the public one. Prefer AUTH_URL, then x-forwarded-*,
  // and fall back to req.url.
  const h = await headers();
  const forwardedHost = h.get('x-forwarded-host') ?? h.get('host');
  const forwardedProto = h.get('x-forwarded-proto') ?? 'https';
  const publicOrigin =
    process.env.AUTH_URL ||
    (forwardedHost ? `${forwardedProto}://${forwardedHost}` : new URL(req.url).origin);

  const url = new URL(req.url);
  const scheme = url.searchParams.get('scheme') ?? 'saas';

  // Prefer an explicit returnUrl from the client (needed in Expo Go, whose
  // return URL looks like `exp://<devserver>/--/auth`). Fall back to the
  // custom scheme for built dev/prod apps.
  const clientReturnUrl = url.searchParams.get('returnUrl');
  const returnBase = clientReturnUrl ?? `${scheme}://auth`;
  const errorRedirect = appendParams(returnBase, { error: 'sign_in_failed' });

  const session = await auth();

  if (!session?.user?.id) {
    const signInUrl = new URL('/', publicOrigin);
    const loopBack = new URL('/auth/mobile', publicOrigin);
    loopBack.searchParams.set('scheme', scheme);
    if (clientReturnUrl) loopBack.searchParams.set('returnUrl', clientReturnUrl);
    signInUrl.searchParams.set('callbackUrl', loopBack.pathname + loopBack.search);
    return NextResponse.redirect(signInUrl);
  }

  // With `session.strategy = 'database'` a Session row already exists from the
  // browser sign-in — grab the newest one so the app uses the freshest token.
  const dbSession = await prisma.session.findFirst({
    where: { userId: session.user.id, expires: { gt: new Date() } },
    orderBy: { expires: 'desc' },
    select: { sessionToken: true, expires: true },
  });

  if (!dbSession) {
    return NextResponse.redirect(errorRedirect);
  }

  const deepLink = appendParams(returnBase, {
    token: dbSession.sessionToken,
    expires: dbSession.expires.toISOString(),
  });

  return NextResponse.redirect(deepLink);
}

/**
 * Safely append query params to a URL that may use a custom scheme
 * (`saas://`, `exp://`), where `new URL(...).searchParams` behavior can be
 * quirky across runtimes. String concatenation keeps the scheme intact.
 */
function appendParams(base: string, params: Record<string, string>): string {
  const sep = base.includes('?') ? '&' : '?';
  const qs = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return `${base}${sep}${qs}`;
}
