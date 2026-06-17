import { useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';

import { API_URL } from './config';
import { trpc } from './trpc';
import { useAuth } from './AuthContext';

/**
 * Provides tRPC + React Query to the app. Sits inside <AuthProvider> so it can
 * read the current session token and inject it as a bearer header on every
 * request. When the token changes we re-create the client so in-flight clients
 * don't keep using a stale token after sign-out.
 */
export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();

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
          headers: () => (session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
        }),
      ],
    });

    return { queryClient, trpcClient };
  }, [session?.token]);

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
