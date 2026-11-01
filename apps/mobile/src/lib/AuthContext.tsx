import { authClient } from './auth-client';

/**
 * Thin auth surface for the mobile app, backed by Better Auth.
 *
 * Better Auth's `useSession` is a store-backed hook and needs no React
 * provider, so `AuthProvider` is just a passthrough kept for layout structure
 * (and a stable place to hang future global auth side effects).
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export interface MobileSession {
  session: { id: string; userId: string; expiresAt: string | Date };
  user: {
    id: string;
    email: string;
    name?: string | null;
    image?: string | null;
    /** Set while the account is scheduled for deletion; it can only restore. */
    deletionScheduledFor?: string | Date | null;
  };
}

export function useAuth() {
  const { data, isPending, refetch } = authClient.useSession();

  return {
    /** `{ session, user }` when signed in, otherwise null. */
    session: (data as MobileSession | null) ?? null,
    /** True until the persisted session has been resolved. */
    isLoading: isPending,
    signOut: async () => {
      await authClient.signOut();
    },
    /** Re-read the session from the server, e.g. after restoring the account. */
    refresh: async () => {
      await refetch();
    },
  };
}
