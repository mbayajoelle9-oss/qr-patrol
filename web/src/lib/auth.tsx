'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, session, setUnauthorizedHandler } from './api';
import type { Organization, Role, User } from './types';

interface AuthState {
  user: User | null;
  org: Organization | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  hasRole: (...roles: Role[]) => boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  /** Super admin : société actuellement supervisée */
  selectedOrgId: string | null;
  selectOrg: (id: string | null) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  const logout = useCallback(() => {
    session.setToken(null);
    session.setOrg(null);
    setUser(null);
    setOrg(null);
    router.replace('/login');
  }, [router]);

  const refresh = useCallback(async () => {
    if (!session.getToken()) {
      setLoading(false);
      return;
    }
    try {
      const { user: u } = await api<{ user: User }>('/auth/me');
      setUser(u);
      if (u.role === 'super_admin') {
        const sel = session.getOrg();
        setSelectedOrgId(sel);
        if (sel) {
          const { organization } = await api<{ organization: Organization }>('/organizations/current').catch(() => ({
            organization: null as unknown as Organization,
          }));
          setOrg(organization);
        } else {
          setOrg(null);
        }
      } else {
        setOrg((u.organization as Organization) || null);
      }
    } catch {
      session.setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    refresh();
  }, [logout, refresh]);

  const login = useCallback(
    async (identifier: string, password: string) => {
      const res = await api<{ token: string; user: User }>('/auth/login', {
        body: { identifier, password, client: 'web' },
      });
      session.setToken(res.token);
      session.setOrg(null);
      setLoading(true);
      await refresh();
    },
    [refresh]
  );

  const selectOrg = useCallback(
    (id: string | null) => {
      session.setOrg(id);
      setSelectedOrgId(id);
      refresh();
    },
    [refresh]
  );

  const value = useMemo<AuthState>(
    () => ({
      user,
      org,
      loading,
      login,
      logout,
      refresh,
      hasRole: (...roles) => !!user && roles.includes(user.role),
      isAdmin: !!user && ['admin', 'super_admin'].includes(user.role),
      isSuperAdmin: user?.role === 'super_admin',
      selectedOrgId,
      selectOrg,
    }),
    [user, org, loading, login, logout, refresh, selectedOrgId, selectOrg]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans AuthProvider');
  return ctx;
}
