'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Clock, Footprints, ScanLine, ShieldAlert, UserCheck, Wifi } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { useSocketEvent } from '@/lib/socket';
import { fmtTime, timeAgo, toLatLng } from '@/lib/format';
import type { Alert, Checkpoint, Incident, Intervention, Patrol, ScanEvent, Site, User } from '@/lib/types';
import MapView, { type MapMarker } from '@/components/MapView';
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, Stat } from '@/components/ui';
import { IncidentBadge, InterventionBadge, SeverityBadge } from '@/components/StatusBadges';

interface Overview {
  kpis: Record<string, number | null>;
  agents: User[];
  patrolsInProgress: Patrol[];
  latePatrols: Patrol[];
  openIncidents: Incident[];
  recentScans: ScanEvent[];
  alerts: Alert[];
  sites: Site[];
  checkpoints: Checkpoint[];
  interventions: Intervention[];
}

export default function CentralePage() {
  const { data, setData, loading, error, reload } = useApi<Overview>('/dashboard/overview');
  const [flash, setFlash] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lng: number } | null>(null);

  // Rafraîchissement de sécurité toutes les 60 s (les évènements temps réel font le reste)
  useEffect(() => {
    const t = setInterval(() => reload(true), 60000);
    return () => clearInterval(t);
  }, [reload]);

  useSocketEvent<ScanEvent>('scan:new', (scan) => {
    setData((d) => {
      if (!d) return d;
      const k = { ...d.kpis };
      k.scansToday = (k.scansToday || 0) + 1;
      if (scan.status === 'valid') k.scansValidToday = (k.scansValidToday || 0) + 1;
      else k.scansSuspiciousToday = (k.scansSuspiciousToday || 0) + 1;
      return { ...d, kpis: k, recentScans: [scan, ...d.recentScans].slice(0, 30) };
    });
    setFlash(scan.id);
    setTimeout(() => setFlash(null), 2500);
  });

  useSocketEvent<{ agentId: string; lat: number; lng: number; accuracy?: number; capturedAt: string }>('position:update', (p) => {
    setData((d) =>
      d
        ? {
            ...d,
            agents: d.agents.map((a) =>
              a.id === p.agentId ? { ...a, onDuty: true, lastPosition: { lat: p.lat, lng: p.lng, accuracy: p.accuracy, capturedAt: p.capturedAt }, lastSeenAt: p.capturedAt } : a
            ),
          }
        : d
    );
  });

  useSocketEvent<Patrol>('patrol:updated', (p) => {
    setData((d) => {
      if (!d) return d;
      const others = d.patrolsInProgress.filter((x) => x.id !== p.id);
      const late = d.latePatrols.filter((x) => x.id !== p.id);
      return {
        ...d,
        patrolsInProgress: p.status === 'in_progress' ? [p, ...others] : others,
        latePatrols: p.status === 'scheduled' && p.lateAlertSent ? [p, ...late] : late,
        kpis: { ...d.kpis, patrolsInProgress: p.status === 'in_progress' ? others.length + 1 : others.length },
      };
    });
  });

  const upsertIncident = (inc: Incident) =>
    setData((d) => {
      if (!d) return d;
      const open = !['resolved', 'closed', 'cancelled'].includes(inc.status);
      const rest = d.openIncidents.filter((x) => x.id !== inc.id);
      const list = open ? [inc, ...rest] : rest;
      return {
        ...d,
        openIncidents: list,
        kpis: {
          ...d.kpis,
          incidentsOpen: list.length,
          incidentsCritical: list.filter((i) => ['critical', 'high'].includes(i.severity)).length,
        },
      };
    });
  useSocketEvent<Incident>('incident:new', upsertIncident);
  useSocketEvent<Incident>('incident:updated', upsertIncident);
  useSocketEvent<Alert>('alert:new', (a) => setData((d) => (d ? { ...d, alerts: [a, ...d.alerts].slice(0, 50) } : d)));
  useSocketEvent('agent:duty', () => reload(true));
  useSocketEvent('intervention:updated', () => reload(true));

  const markers = useMemo<MapMarker[]>(() => {
    if (!data) return [];
    const m: MapMarker[] = [];
    data.sites.forEach((s) => {
      const ll = toLatLng(s.location);
      if (ll) m.push({ id: `s-${s.id}`, lat: ll[0], lng: ll[1], kind: 'site', radius: s.geofenceRadius, popup: `<b>${s.name}</b><br/>${s.address || ''}` });
    });
    data.checkpoints.forEach((c) => {
      const ll = toLatLng(c.location);
      if (ll) m.push({ id: `c-${c.id}`, lat: ll[0], lng: ll[1], kind: 'checkpoint', popup: `<b>${c.code || ''} ${c.name}</b><br/>Rayon ${c.radius || '—'} m` });
    });
    data.agents.forEach((a) => {
      const p = a.lastPosition;
      if (p?.lat == null) return;
      const fresh = a.lastSeenAt && Date.now() - new Date(a.lastSeenAt).getTime() < 15 * 60000;
      m.push({
        id: `a-${a.id}`,
        lat: p.lat,
        lng: p.lng,
        kind: a.onDuty && fresh ? 'agent' : 'agent-off',
        label: `${a.firstName} ${a.lastName[0]}.`,
        popup: `<b>${a.firstName} ${a.lastName}</b> (${a.matricule || ''})<br/>Vu ${timeAgo(a.lastSeenAt)}<br/>Précision ±${Math.round(p.accuracy || 0)} m`,
      });
    });
    data.openIncidents.forEach((i) => {
      const loc = i.location || (i.site?.location ? { lat: i.site.location.coordinates[1], lng: i.site.location.coordinates[0] } : null);
      if (!loc) return;
      m.push({
        id: `i-${i.id}`,
        lat: loc.lat,
        lng: loc.lng,
        kind: i.type === 'sos' ? 'sos' : 'incident',
        label: i.type === 'sos' ? 'SOS' : i.typeLabel,
        popup: `<b>${i.reference}</b><br/>${i.typeLabel} · ${i.severityLabel}<br/><a href="/incidents/${i.id}" style="color:#e92026">Ouvrir</a>`,
      });
    });
    return m;
  }, [data]);

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox error={error} />;
  if (!data) return null;
  const k = data.kpis;

  return (
    <>
      <PageHeader
        title="Centrale de sécurité"
        subtitle={`Supervision en temps réel · ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Agents en service" value={`${k.agentsOnDuty}/${k.agentsTotal}`} icon={<UserCheck className="h-4 w-4" />} hint={`${k.agentsOnline} connecté(s)`} />
        <Stat label="Rondes en cours" value={k.patrolsInProgress ?? 0} icon={<Footprints className="h-4 w-4" />} tone="success" />
        <Stat label="Rondes en retard" value={k.patrolsLate ?? 0} tone={k.patrolsLate ? 'warning' : undefined} icon={<Clock className="h-4 w-4" />} hint={`${k.patrolsMissedToday} manquée(s) aujourd’hui`} />
        <Stat label="Passages aujourd’hui" value={k.scansToday ?? 0} icon={<ScanLine className="h-4 w-4" />} hint={`${k.scansSuspiciousToday} suspect(s)`} />
        <Stat label="Incidents ouverts" value={k.incidentsOpen ?? 0} tone={k.incidentsCritical ? 'danger' : undefined} icon={<ShieldAlert className="h-4 w-4" />} hint={`${k.incidentsCritical} grave(s)`} />
        <Stat
          label="Conformité du jour"
          value={k.complianceRate != null ? `${k.complianceRate}%` : '—'}
          tone={k.complianceRate == null ? undefined : k.complianceRate >= 90 ? 'success' : k.complianceRate >= 70 ? 'warning' : 'danger'}
          icon={<CheckCircle2 className="h-4 w-4" />}
          hint={`${k.patrolsCompletedToday} ronde(s) complète(s)`}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_400px]">
        <div className="space-y-4">
          <Card title="Carte des sites et des agents" className="overflow-hidden">
            <div className="h-[520px]">
              <MapView markers={markers} focus={focus} />
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title={`Rondes en cours (${data.patrolsInProgress.length})`}>
              {data.patrolsInProgress.length === 0 ? (
                <Empty>Aucune ronde en cours.</Empty>
              ) : (
                <ul className="divide-y divide-line">
                  {data.patrolsInProgress.map((p) => {
                    const pct = p.stats.total ? Math.round((p.stats.done / p.stats.total) * 100) : 0;
                    return (
                      <li key={p.id}>
                        <Link href={`/rondes/${p.id}`} className="block px-4 py-3 hover:bg-white/5">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium text-white">
                              {p.agent?.firstName} {p.agent?.lastName}
                            </span>
                            <span className="text-xs text-steel">
                              {p.stats.done}/{p.stats.total} points
                            </span>
                          </div>
                          <div className="mt-0.5 text-xs text-steel">
                            {(p.route as { name?: string })?.name} · {(p.site as { name?: string })?.name} · depuis {fmtTime(p.startedAt)}
                          </div>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                            <div className={clsx('h-full rounded-full', p.stats.suspicious ? 'bg-amber-500' : 'bg-emerald-500')} style={{ width: `${pct}%` }} />
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card title={`Rondes en retard (${data.latePatrols.length})`}>
              {data.latePatrols.length === 0 ? (
                <Empty>Aucun retard. 👍</Empty>
              ) : (
                <ul className="divide-y divide-line">
                  {data.latePatrols.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                      <Clock className="h-4 w-4 text-amber-400" />
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="truncate text-white">{(p.route as { name?: string })?.name}</p>
                        <p className="text-xs text-steel">
                          {(p.site as { name?: string })?.name} · prévue {fmtTime(p.scheduledStart)} · {p.agent ? `${p.agent.firstName} ${p.agent.lastName}` : 'non attribuée'}
                        </p>
                      </div>
                      <Badge tone="warning">Retard</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>

        <div className="space-y-4">
          <Card
            title={`Incidents en cours (${data.openIncidents.length})`}
            actions={
              <Link href="/incidents" className="text-xs text-brand hover:underline">
                Tout voir
              </Link>
            }
          >
            {data.openIncidents.length === 0 ? (
              <Empty>Aucun incident ouvert.</Empty>
            ) : (
              <ul className="max-h-[340px] divide-y divide-line overflow-y-auto">
                {data.openIncidents.map((i) => (
                  <li key={i.id}>
                    <Link href={`/incidents/${i.id}`} className={clsx('block px-4 py-3 hover:bg-white/5', i.type === 'sos' && 'bg-brand/10')}>
                      <div className="flex items-center justify-between gap-2">
                        <span className={clsx('text-sm font-semibold', i.type === 'sos' ? 'text-brand' : 'text-white')}>
                          {i.type === 'sos' ? '🆘 ' : ''}
                          {i.typeLabel}
                        </span>
                        <SeverityBadge severity={i.severity} />
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs text-steel">
                        <span className="truncate">
                          {i.reportedBy?.firstName} {i.reportedBy?.lastName}
                          {i.site ? ` · ${i.site.name}` : ''} · {timeAgo(i.createdAt)}
                        </span>
                        <IncidentBadge status={i.status} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {data.interventions.length > 0 && (
            <Card title="Interventions actives">
              <ul className="divide-y divide-line">
                {data.interventions.map((iv) => (
                  <li key={iv.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="text-white">{iv.team?.name || 'Intervenants'}</span>
                    <span className="text-xs text-steel">{iv.incident?.reference}</span>
                    <InterventionBadge status={iv.status} />
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card
            title={
              <span className="flex items-center gap-2">
                <Wifi className="h-3.5 w-3.5 text-emerald-400" /> Derniers passages
              </span>
            }
            actions={
              <Link href="/scans" className="text-xs text-brand hover:underline">
                Historique
              </Link>
            }
          >
            {data.recentScans.length === 0 ? (
              <Empty>Aucun passage enregistré.</Empty>
            ) : (
              <ul className="max-h-[420px] divide-y divide-line overflow-y-auto">
                {data.recentScans.map((s) => (
                  <li
                    key={s.id}
                    className={clsx('flex cursor-pointer items-start gap-3 px-4 py-2.5 transition hover:bg-white/5', flash === s.id && 'bg-emerald-500/10')}
                    onClick={() => s.location && setFocus({ lat: s.location.lat, lng: s.location.lng })}
                  >
                    <span
                      className={clsx(
                        'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full',
                        s.status === 'valid' ? 'bg-emerald-500' : s.status === 'suspicious' ? 'bg-amber-500' : 'bg-brand'
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-white">
                        {s.agent?.firstName} {s.agent?.lastName} — {s.checkpoint?.name || 'QR inconnu'}
                      </p>
                      <p className="text-xs text-steel">
                        {fmtTime(s.scannedAt, true)} · {s.site?.name || ''}
                        {s.distanceMeters != null ? ` · ${s.distanceMeters} m` : ''}
                        {s.offline ? ' · hors-ligne' : ''}
                      </p>
                      {s.status !== 'valid' && (
                        <p className="mt-0.5 text-[11px] text-amber-400">
                          <AlertTriangle className="mr-1 inline h-3 w-3" />
                          {(s.flagLabels || s.flags).join(' · ')}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
