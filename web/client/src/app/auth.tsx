import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, UNAUTHORIZED_EVENT } from '../api/client';
import type { User } from '../api/types';

interface AuthState {
  /** undefined = still checking the session, null = signed out */
  user: User | null | undefined;
  login: (company: string, username: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  /** Re-reads /api/auth/me (e.g. after changing the password) */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get<{ user: User }>('/api/auth/me');
      setUser(res.user);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setUser(null);
      } else {
        throw e;
      }
    }
  }, []);

  useEffect(() => {
    void refresh().catch(() => setUser(null));
    const onUnauthorized = () => setUser(null);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [refresh]);

  const login = useCallback(async (company: string, username: string, password: string) => {
    const res = await api.post<{ user: User }>('/api/auth/login', { company: company.trim() || undefined, username, password });
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout');
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(() => ({ user, login, logout, refresh }), [user, login, logout, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }

  return ctx;
}
