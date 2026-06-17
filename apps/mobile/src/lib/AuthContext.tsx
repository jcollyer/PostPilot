import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import {
  clearStoredSession,
  getStoredSession,
  signInWithBrowser,
  type StoredSession,
} from './auth';

interface AuthContextValue {
  session: StoredSession | null;
  /** True before the persisted session has been checked. Render a splash until it flips. */
  isLoading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load any persisted session on mount.
  useEffect(() => {
    (async () => {
      const stored = await getStoredSession();
      setSession(stored);
      setIsLoading(false);
    })();
  }, []);

  const signIn = useCallback(async () => {
    const next = await signInWithBrowser();
    setSession(next);
  }, []);

  const signOut = useCallback(async () => {
    await clearStoredSession();
    setSession(null);
  }, []);

  return (
    <AuthContext.Provider value={{ session, isLoading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
