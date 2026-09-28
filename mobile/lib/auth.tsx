import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { api, setUnauthorizedHandler } from './api';
import { API_URL } from './config';
import { getDeviceInfo } from './device';
import { registerForPush } from './notifications';
import { secure } from './storage';
import { startTracking, stopTracking } from './tracking';
import { getQuickLocation } from './location';
import { bus } from './events';
import type { User } from './types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setOnDuty: (on: boolean) => Promise<{ background?: boolean }>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(async () => {
    await stopTracking();
    try {
      await api('/auth/push-token', { body: { pushToken: null } });
    } catch {
      /* hors-ligne */
    }
    await secure.setToken(null);
    await secure.setUser(null);
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    const token = await secure.getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    // Affichage immédiat depuis le cache (utile hors-ligne)
    const cached = await secure.getUser<User>();
    if (cached) setUser(cached);
    try {
      const { user: u } = await api<{ user: User }>('/auth/me');
      setUser(u);
      await secure.setUser(u);
      if (u.onDuty) startTracking(u.organization?.settings?.positionPingSeconds || 60).catch(() => {});
    } catch (e) {
      if ((e as { status?: number }).status === 401) {
        await secure.setToken(null);
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      logout();
    });
    refresh();
  }, [logout, refresh]);

  // Temps réel : mises à jour des rondes et interventions
  useEffect(() => {
    if (!user) return;
    let socket: Socket | null = null;
    let cancelled = false;
    secure.getToken().then((token) => {
      if (cancelled || !token) return;
      socket = io(API_URL, { auth: { token }, transports: ['websocket'] });
      socket.on('patrol:updated', (p) => bus.emit('patrol:updated', p));
      socket.on('intervention:new', (p) => bus.emit('intervention:new', p));
      socket.on('incident:updated', (p) => bus.emit('incident:updated', p));
    });
    return () => {
      cancelled = true;
      socket?.disconnect();
    };
  }, [user]);

  const login = useCallback(async (identifier: string, password: string) => {
    const device = await getDeviceInfo();
    const pushToken = await registerForPush();
    const res = await api<{ token: string; user: User }>('/auth/login', {
      body: { identifier, password, client: 'mobile', device, pushToken: pushToken || undefined },
    });
    if (!['agent', 'responder'].includes(res.user.role)) {
      throw new Error('Cette application est réservée aux agents. La centrale et l’administration se font sur le site web.');
    }
    await secure.setToken(res.token);
    await secure.setUser(res.user);
    setUser(res.user);
  }, []);

  const setOnDuty = useCallback(
    async (on: boolean) => {
      if (on) {
        const location = await getQuickLocation();
        const r = await api<{ user: User }>('/presence/duty/start', { body: { location } });
        const t = await startTracking(user?.organization?.settings?.positionPingSeconds || 60);
        setUser((u) => (u ? { ...u, onDuty: true, dutyStartedAt: r.user.dutyStartedAt } : u));
        return { background: t.background };
      }
      await api('/presence/duty/end', { body: {} });
      await stopTracking();
      setUser((u) => (u ? { ...u, onDuty: false } : u));
      return {};
    },
    [user]
  );

  const value = useMemo(() => ({ user, loading, login, logout, refresh, setOnDuty }), [user, loading, login, logout, refresh, setOnDuty]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('AuthProvider manquant');
  return c;
}
