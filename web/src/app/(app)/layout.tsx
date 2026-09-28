'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { SocketProvider, useSocketEvent } from '@/lib/socket';
import { api } from '@/lib/api';
import { beep, desktopNotify, requestNotificationPermission } from '@/lib/sound';
import { Sidebar } from '@/components/Sidebar';
import { SosOverlay } from '@/components/SosOverlay';
import { Loading, useToast } from '@/components/ui';
import type { Alert, Incident } from '@/lib/types';

function Shell({ children }: { children: React.ReactNode }) {
  const { org, isSuperAdmin } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const [unread, setUnread] = useState(0);
  const [sos, setSos] = useState<Incident[]>([]);

  const loadUnread = useCallback(async () => {
    if (isSuperAdmin && !org) return;
    try {
      const r = await api<{ unread: number }>('/alerts', { query: { limit: 1, acknowledged: false } });
      setUnread(r.unread);
    } catch {
      /* ignore */
    }
  }, [isSuperAdmin, org]);

  useEffect(() => {
    loadUnread();
    requestNotificationPermission();
  }, [loadUnread]);

  // Super admin sans société sélectionnée : seules les pages plateforme sont accessibles
  useEffect(() => {
    if (isSuperAdmin && !org && pathname !== '/plateforme') router.replace('/plateforme');
  }, [isSuperAdmin, org, pathname, router]);

  useSocketEvent<Alert>('alert:new', (a) => {
    setUnread((n) => n + 1);
    if (a.type === 'sos') return; // géré par sos:new
    if (a.level !== 'info') {
      beep(a.level === 'critical' ? 'alert' : 'info');
      desktopNotify(a.title, a.message);
      toast(`${a.title} — ${a.message}`, a.level === 'critical' ? 'error' : 'info');
    }
  });
  useSocketEvent('alert:ack', () => loadUnread());
  useSocketEvent<Incident>('sos:new', (inc) => {
    setSos((l) => [inc, ...l.filter((x) => x.id !== inc.id)]);
    beep('sos');
    desktopNotify('🚨 SOS — agent en danger', `${inc.reportedBy?.firstName} ${inc.reportedBy?.lastName}`);
  });
  useSocketEvent<Incident>('incident:updated', (inc) => {
    if (inc.type === 'sos' && inc.status !== 'declared') setSos((l) => l.filter((x) => x.id !== inc.id));
  });

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar unreadAlerts={unread} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1600px] p-6">{children}</div>
      </main>
      <SosOverlay incidents={sos} onDismiss={(id) => setSos((l) => l.filter((x) => x.id !== id))} />
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);
  if (loading || !user) return <Loading />;
  return (
    <SocketProvider>
      <Shell>{children}</Shell>
    </SocketProvider>
  );
}
