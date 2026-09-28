'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import clsx from 'clsx';
import { ArrowLeft, CheckCircle2, CircleDashed, TriangleAlert, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useSocketEvent } from '@/lib/socket';
import { durationMin, fmtDateTime, fmtTime, toLatLng } from '@/lib/format';
import type { Patrol, ScanEvent } from '@/lib/types';
import MapView, { type MapMarker } from '@/components/MapView';
import { Button, Card, ErrorBox, Loading, Stat, useToast } from '@/components/ui';
import { PatrolBadge, ScanBadge } from '@/components/StatusBadges';

export default function PatrolDetail() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const { data, loading, error, reload } = useApi<{ patrol: Patrol; scans: ScanEvent[] }>(`/patrols/${id}`);
  const { data: track } = useApi<{ items: { lat: number; lng: number }[] }>(
    data?.patrol.agent && data.patrol.startedAt ? `/presence/track/${data.patrol.agent.id}` : null,
    data?.patrol.startedAt ? { from: data.patrol.startedAt, to: data.patrol.endedAt } : undefined
  );
  useSocketEvent<Patrol>('patrol:updated', (p) => p.id === id && reload(true));

  const markers = useMemo<MapMarker[]>(() => {
    if (!data) return [];
    const m: MapMarker[] = [];
    data.patrol.checkpoints.forEach((c) => {
      const ll = toLatLng(c.checkpoint?.location);
      if (ll) m.push({ id: `c-${c.checkpoint.id}`, lat: ll[0], lng: ll[1], kind: 'checkpoint', radius: c.checkpoint.radius, label: c.checkpoint.code || c.checkpoint.name });
    });
    data.scans.forEach((s) => {
      if (s.location) m.push({ id: `s-${s.id}`, lat: s.location.lat, lng: s.location.lng, kind: s.status === 'valid' ? 'scan-ok' : 'scan-bad', popup: `${s.checkpoint?.name || ''} · ${fmtTime(s.scannedAt, true)}` });
    });
    return m;
  }, [data]);

  async function action(kind: 'end' | 'cancel') {
    try {
      await api(`/patrols/${id}/${kind}`, { body: {} });
      toast(kind === 'end' ? 'Ronde clôturée' : 'Ronde annulée');
      reload(true);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox error={error} />;
  if (!data) return null;
  const p = data.patrol;
  const scanByCp = new Map(data.scans.map((s) => [s.checkpoint?.id, s]));

  return (
    <>
      <Link href="/rondes" className="mb-3 inline-flex items-center gap-1 text-sm text-steel hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Rondes
      </Link>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">
            {(p.route as { name?: string })?.name} <span className="text-steel">· {(p.site as { name?: string })?.name}</span>
          </h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-steel">
            <PatrolBadge status={p.status} />
            {p.agent ? `${p.agent.firstName} ${p.agent.lastName}` : 'Non attribuée'} · prévue {fmtDateTime(p.scheduledStart)} · échéance {fmtTime(p.dueBy)}
          </p>
          {p.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-steel-2">{p.notes}</p>}
        </div>
        <div className="flex gap-2">
          {p.status === 'in_progress' && (
            <Button variant="secondary" onClick={() => action('end')}>
              Clôturer
            </Button>
          )}
          {['scheduled', 'in_progress'].includes(p.status) && (
            <Button variant="danger" onClick={() => action('cancel')}>
              Annuler
            </Button>
          )}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Points contrôlés" value={`${p.stats.done}/${p.stats.total}`} tone={p.stats.done === p.stats.total ? 'success' : undefined} />
        <Stat label="Suspects" value={p.stats.suspicious} tone={p.stats.suspicious ? 'warning' : undefined} />
        <Stat label="Manqués" value={p.stats.missed} tone={p.stats.missed ? 'danger' : undefined} />
        <Stat label="Incidents" value={p.stats.incidents} />
        <Stat label="Durée" value={p.startedAt ? durationMin(p.startedAt, p.endedAt) : '—'} hint={p.startedAt ? `début ${fmtTime(p.startedAt)}` : undefined} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_440px]">
        <Card title="Parcours réel de l’agent" className="overflow-hidden">
          <div className="h-[520px]">
            <MapView markers={markers} track={track?.items.map((t) => [t.lat, t.lng] as [number, number])} fitKey={p.id} />
          </div>
        </Card>
        <Card title="Points de contrôle">
          <ol className="divide-y divide-line">
            {p.checkpoints.map((c) => {
              const s = scanByCp.get(c.checkpoint?.id);
              const Icon = c.status === 'done' ? CheckCircle2 : c.status === 'suspicious' ? TriangleAlert : c.status === 'missed' ? XCircle : CircleDashed;
              return (
                <li key={c.checkpoint?.id || c.order} className="flex items-start gap-3 px-4 py-3">
                  <Icon
                    className={clsx(
                      'mt-0.5 h-5 w-5 shrink-0',
                      c.status === 'done' && 'text-emerald-500',
                      c.status === 'suspicious' && 'text-amber-400',
                      c.status === 'missed' && 'text-brand',
                      c.status === 'pending' && 'text-zinc-600'
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white">
                      <span className="text-steel">{c.order}.</span> {c.checkpoint?.code} {c.checkpoint?.name}
                      {c.optional && <span className="ml-1 text-[11px] text-steel">(facultatif)</span>}
                    </p>
                    {s ? (
                      <p className="text-xs text-steel">
                        {fmtTime(s.scannedAt, true)}
                        {s.distanceMeters != null && ` · ${s.distanceMeters} m du point`}
                        {s.location?.accuracy != null && ` · GPS ±${Math.round(s.location.accuracy)} m`}
                        {s.offline && ' · hors-ligne'}
                      </p>
                    ) : (
                      <p className="text-xs text-zinc-600">{c.status === 'missed' ? 'Non contrôlé' : 'En attente'}</p>
                    )}
                    {s && s.flags.length > 0 && <p className="mt-0.5 text-[11px] text-amber-400">{(s.flagLabels || s.flags).join(' · ')}</p>}
                  </div>
                  {s && <ScanBadge status={s.status} />}
                </li>
              );
            })}
          </ol>
        </Card>
      </div>
    </>
  );
}
