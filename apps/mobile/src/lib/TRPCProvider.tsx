import { useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';

import { API_URL } from './config';
import { trpc } from './trpc';
import { authClient } from './auth-client';

/**
 * Provides tRPC + React Query to the app. On every request it forwards the
 * Better Auth session cookie (persisted in SecureStore by the Expo plugin) as
 * a `Cookie` header, so the server resolves the same session it would for the
 * web client. When the signed-in user changes we re-create the client so no
 * in-flight client keeps using a stale cookie after sign-out.
 */
export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const { data } = authClient.useSession();
  const userId = data?.user?.id ?? null;

  const { queryClient, trpcClient } = useMemo(() => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { staleTime: 30_000, retry: 1 },
      },
    });

    const trpcClient = trpc.createClient({
      links: [
        httpBatchLink({
          url: `${API_URL}/api/trpc`,
          transformer: superjson,
          headers: () => {
            const cookie = authClient.getCookie();
            return cookie ? { Cookie: cookie } : {};
          },
        }),
      ],
    });

    return { queryClient, trpcClient };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
