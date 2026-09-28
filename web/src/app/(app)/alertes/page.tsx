'use client';

import { useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { AlertTriangle, BellRing, Clock, ScanLine, Siren, Smartphone, WifiOff } from 'lucide-react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useSocketEvent } from '@/lib/socket';
import { fmtDateTime } from '@/lib/format';
import type { Alert } from '@/lib/types';
import { Button, Card, Empty, ErrorBox, Loading, PageHeader, Select, useToast } from '@/components/ui';

const ICONS: Record<Alert['type'], React.ElementType> = {
  sos: Siren,
  incident: AlertTriangle,
  suspicious_scan: ScanLine,
  patrol_late: Clock,
  patrol_missed: Clock,
  agent_offline: WifiOff,
  device_change: Smartphone,
};

export default function AlertesPage() {
  const toast = useToast();
  const [filter, setFilter] = useState('false');
  const { data, loading, error, reload } = useApi<{ items: Alert[]; total: number; unread: number }>('/alerts', {
    acknowledged: filter || undefined,
    limit: 100,
  });
  useSocketEvent('alert:new', () => reload(true));

  async function ack(id: string) {
    await api(`/alerts/${id}/ack`, { body: {} });
    reload(true);
  }
  async function ackAll() {
    const r = await api<{ updated: number }>('/alerts/ack-all', { body: {} });
    toast(`${r.updated} alerte(s) marquée(s) comme traitée(s)`);
    reload(true);
  }

  function link(a: Alert) {
    if (a.incident) return `/incidents/${a.incident}`;
    if (a.patrol) return `/rondes/${a.patrol}`;
    if (a.scan) return '/scans';
    return null;
  }

  return (
    <>
      <PageHeader
        title="Alertes"
        subtitle="SOS, incidents, contrôles suspects, rondes en retard ou manquées, agents sans signal"
        actions={
          <>
            <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="!w-44">
              <option value="false">À traiter</option>
              <option value="true">Traitées</option>
              <option value="">Toutes</option>
            </Select>
            <Button variant="secondary" onClick={ackAll}>
              Tout marquer traité
            </Button>
          </>
        }
      />
      <Card>
        <ErrorBox error={error} />
        {loading && !data ? (
          <Loading />
        ) : !data?.items.length ? (
          <Empty>
            <BellRing className="mx-auto mb-2 h-6 w-6" /> Aucune alerte.
          </Empty>
        ) : (
          <ul className="divide-y divide-line">
            {data.items.map((a) => {
              const Icon = ICONS[a.type] || AlertTriangle;
              const href = link(a);
              return (
                <li key={a.id} className={clsx('flex items-start gap-4 px-4 py-3', !a.acknowledged && a.level === 'critical' && 'bg-brand/5')}>
                  <div
                    className={clsx(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                      a.level === 'critical' ? 'bg-brand text-white' : a.level === 'warning' ? 'bg-amber-950 text-amber-400' : 'bg-zinc-800 text-steel'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white">{a.title}</p>
                    <p className="text-sm text-steel-2">{a.message}</p>
                    <p className="mt-0.5 text-[11px] text-steel">
                      {fmtDateTime(a.createdAt)}
                      {a.site?.name ? ` · ${a.site.name}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {href && (
                      <Link href={href} className="text-xs text-brand hover:underline">
                        Voir
                      </Link>
                    )}
                    {!a.acknowledged && (
                      <Button size="sm" variant="secondary" onClick={() => ack(a.id)}>
                        Traité
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
