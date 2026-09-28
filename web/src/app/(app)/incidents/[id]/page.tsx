'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import clsx from 'clsx';
import { ArrowLeft, Check, MapPin, MessageSquare, Phone, Siren, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useSocketEvent } from '@/lib/socket';
import { fmtDateTime, fmtTime, INCIDENT_STATUS } from '@/lib/format';
import type { Incident, IncidentStatus, Intervention, Meta, Team, User } from '@/lib/types';
import MapView from '@/components/MapView';
import { Button, Card, Checkbox, Empty, ErrorBox, Field, Loading, Modal, Select, Textarea, useToast } from '@/components/ui';
import { IncidentBadge, InterventionBadge, SeverityBadge } from '@/components/StatusBadges';

const FLOW: IncidentStatus[] = ['declared', 'acknowledged', 'dispatched', 'on_site', 'resolved', 'closed'];

const ACTION_LABELS: Record<string, string> = {
  created: 'Incident déclaré',
  comment: 'Commentaire',
  media: 'Média ajouté',
  dispatch: 'Intervention envoyée',
  updated: 'Modification',
};

export default function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const { data, setData, loading, error, reload } = useApi<{ incident: Incident; interventions: Intervention[] }>(`/incidents/${id}`);
  const { data: meta } = useApi<Meta>('/meta');
  const { data: teams } = useApi<{ items: Team[] }>('/teams');
  const { data: responders } = useApi<{ items: User[] }>('/users', { role: 'responder,agent', active: true });
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [dispatchForm, setDispatchForm] = useState<{ teamId: string; memberIds: string[]; instructions: string }>({ teamId: '', memberIds: [], instructions: '' });
  const [resolveOpen, setResolveOpen] = useState<IncidentStatus | null>(null);
  const [resolution, setResolution] = useState('');

  useSocketEvent<Incident>('incident:updated', (inc) => {
    if (inc.id === id) setData((d) => (d ? { ...d, incident: inc } : d));
  });
  useSocketEvent<Intervention>('intervention:updated', () => reload(true));

  const inc = data?.incident;
  const markers = useMemo(() => {
    if (!inc) return [];
    const m = [];
    if (inc.location) m.push({ id: 'loc', lat: inc.location.lat, lng: inc.location.lng, kind: inc.type === 'sos' ? ('sos' as const) : ('incident' as const), label: inc.reference });
    if (inc.site?.location) m.push({ id: 'site', lat: inc.site.location.coordinates[1], lng: inc.site.location.coordinates[0], kind: 'site' as const, label: inc.site.name });
    return m;
  }, [inc]);

  async function setStatus(status: IncidentStatus, noteText?: string) {
    setBusy(status);
    try {
      const r = await api<{ incident: Incident }>(`/incidents/${id}/status`, { method: 'PATCH', body: { status, note: noteText || undefined } });
      setData((d) => (d ? { ...d, incident: r.incident } : d));
      toast(`Statut : ${INCIDENT_STATUS[status].label}`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  }

  async function addNote(files?: FileList | null) {
    setBusy('note');
    try {
      const mediaIds: string[] = [];
      if (files) {
        for (const f of Array.from(files)) {
          const fd = new FormData();
          fd.append('file', f);
          fd.append('context', 'incident');
          // eslint-disable-next-line no-await-in-loop
          const r = await api<{ media: { id: string } }>('/media', { body: fd });
          mediaIds.push(r.media.id);
        }
      }
      if (!note && !mediaIds.length) return;
      const r = await api<{ incident: Incident }>(`/incidents/${id}/notes`, { body: { note: note || undefined, mediaIds } });
      setData((d) => (d ? { ...d, incident: r.incident } : d));
      setNote('');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  }

  async function dispatch() {
    setBusy('dispatch');
    try {
      await api(`/incidents/${id}/dispatch`, {
        body: {
          teamId: dispatchForm.teamId || undefined,
          memberIds: dispatchForm.memberIds.length ? dispatchForm.memberIds : undefined,
          instructions: dispatchForm.instructions || undefined,
        },
      });
      toast('Équipe d’intervention envoyée');
      setDispatchOpen(false);
      reload(true);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  }

  async function updateIntervention(ivId: string, status: string) {
    try {
      await api(`/interventions/${ivId}`, { method: 'PATCH', body: { status } });
      reload(true);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox error={error} />;
  if (!inc) return null;

  const allowed = meta?.incidentTransitions?.[inc.status] || [];
  const stepIndex = FLOW.indexOf(inc.status);

  return (
    <>
      <Link href="/incidents" className="mb-3 inline-flex items-center gap-1 text-sm text-steel hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Incidents
      </Link>

      <div className={clsx('mb-4 rounded-xl border p-5', inc.type === 'sos' ? 'border-brand bg-brand/10' : 'border-line bg-panel')}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs text-steel">{inc.reference}</p>
            <h1 className={clsx('mt-1 text-2xl font-bold', inc.type === 'sos' ? 'text-brand' : 'text-white')}>
              {inc.type === 'sos' ? '🆘 ' : ''}
              {inc.title || inc.typeLabel}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-steel">
              <SeverityBadge severity={inc.severity} />
              <IncidentBadge status={inc.status} />
              <span>· {fmtDateTime(inc.createdAt)}</span>
              {inc.site && <span>· {inc.site.name}</span>}
              {inc.checkpoint && <span>· Point {inc.checkpoint.name}</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {allowed.includes('acknowledged') && (
              <Button loading={busy === 'acknowledged'} onClick={() => setStatus('acknowledged')}>
                <Check className="h-4 w-4" /> Prendre en charge
              </Button>
            )}
            {(allowed.includes('dispatched') || inc.status === 'dispatched') && (
              <Button variant="outline" onClick={() => setDispatchOpen(true)}>
                <Siren className="h-4 w-4" /> Envoyer une équipe
              </Button>
            )}
            {allowed.includes('on_site') && (
              <Button variant="secondary" loading={busy === 'on_site'} onClick={() => setStatus('on_site')}>
                Équipe sur place
              </Button>
            )}
            {allowed.includes('resolved') && (
              <Button variant="secondary" onClick={() => setResolveOpen('resolved')}>
                Marquer résolu
              </Button>
            )}
            {allowed.includes('closed') && (
              <Button variant="secondary" loading={busy === 'closed'} onClick={() => setStatus('closed')}>
                Clôturer
              </Button>
            )}
            {allowed.includes('cancelled') && (
              <Button variant="ghost" onClick={() => setResolveOpen('cancelled')}>
                Annuler (fausse alerte)
              </Button>
            )}
          </div>
        </div>

        {/* Progression du workflow */}
        {inc.status !== 'cancelled' && (
          <ol className="mt-5 grid grid-cols-6 gap-1">
            {FLOW.map((s, i) => (
              <li key={s} className="text-center">
                <div className={clsx('h-1.5 rounded-full', i <= stepIndex ? 'bg-brand' : 'bg-zinc-800')} />
                <span className={clsx('mt-1.5 block text-[11px]', i <= stepIndex ? 'text-white' : 'text-zinc-600')}>{INCIDENT_STATUS[s].label}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <div className="space-y-4">
          <Card title="Déclaration">
            <div className="grid gap-4 p-4 md:grid-cols-2">
              <div className="space-y-2 text-sm">
                <p className="text-steel">Déclaré par</p>
                <p className="text-white">
                  {inc.reportedBy?.firstName} {inc.reportedBy?.lastName} {inc.reportedBy?.matricule && <span className="text-steel">({inc.reportedBy.matricule})</span>}
                </p>
                {inc.reportedBy?.phone && (
                  <a href={`tel:${inc.reportedBy.phone}`} className="inline-flex items-center gap-1 text-brand hover:underline">
                    <Phone className="h-3.5 w-3.5" /> {inc.reportedBy.phone}
                  </a>
                )}
                <p className="pt-2 text-steel">Description</p>
                <p className="whitespace-pre-wrap text-white">{inc.description || '—'}</p>
                {inc.location && (
                  <p className="pt-2 text-xs text-steel">
                    <MapPin className="mr-1 inline h-3.5 w-3.5" />
                    {inc.location.lat.toFixed(6)}, {inc.location.lng.toFixed(6)} · ±{Math.round(inc.location.accuracy || 0)} m
                    {inc.location.mocked && <span className="ml-2 text-amber-400">position simulée !</span>}
                  </p>
                )}
                {inc.resolution && (
                  <>
                    <p className="pt-2 text-steel">Résolution</p>
                    <p className="whitespace-pre-wrap text-emerald-300">{inc.resolution}</p>
                  </>
                )}
              </div>
              <div className="h-64 overflow-hidden rounded-lg border border-line">
                {markers.length ? <MapView markers={markers} /> : <Empty>Pas de position GPS.</Empty>}
              </div>
            </div>
          </Card>

          <Card title={`Photos & vidéos (${inc.media.length})`}>
            {inc.media.length === 0 ? (
              <Empty>Aucun média joint.</Empty>
            ) : (
              <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-3">
                {inc.media.map((m) =>
                  m.kind === 'video' ? (
                    <video key={m.id} src={m.url} controls className="aspect-video w-full rounded-lg bg-black" />
                  ) : m.kind === 'audio' ? (
                    <audio key={m.id} src={m.url} controls className="w-full" />
                  ) : (
                    <a key={m.id} href={m.url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={m.url} alt="" className="aspect-square w-full rounded-lg object-cover transition hover:opacity-80" />
                    </a>
                  )
                )}
              </div>
            )}
          </Card>

          <Card title="Interventions">
            {!data.interventions.length ? (
              <Empty>Aucune équipe envoyée.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {data.interventions.map((iv) => (
                  <li key={iv.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-white">
                        {iv.team?.name || 'Intervenants'} {iv.team?.callSign && <span className="text-steel">({iv.team.callSign})</span>}
                      </p>
                      <p className="text-xs text-steel">
                        {iv.members.map((m) => `${m.firstName} ${m.lastName}`).join(', ')} · envoyée {fmtTime(iv.dispatchedAt)}
                        {iv.onSiteAt && ` · sur place ${fmtTime(iv.onSiteAt)}`}
                      </p>
                      {iv.report && <p className="mt-1 text-xs text-steel-2">Rapport : {iv.report}</p>}
                    </div>
                    <InterventionBadge status={iv.status} />
                    {iv.status === 'dispatched' && (
                      <Button size="sm" variant="secondary" onClick={() => updateIntervention(iv.id, 'en_route')}>
                        En route
                      </Button>
                    )}
                    {['dispatched', 'en_route'].includes(iv.status) && (
                      <Button size="sm" variant="secondary" onClick={() => updateIntervention(iv.id, 'on_site')}>
                        Sur place
                      </Button>
                    )}
                    {['dispatched', 'en_route', 'on_site'].includes(iv.status) && (
                      <Button size="sm" onClick={() => updateIntervention(iv.id, 'completed')}>
                        Terminée
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card title="Journal de l’incident">
          <ol className="relative space-y-4 border-l border-line px-4 py-4 ml-6">
            {inc.timeline.map((t, i) => {
              const label = t.action.startsWith('status:')
                ? INCIDENT_STATUS[t.action.slice(7) as IncidentStatus]?.label
                : t.action.startsWith('intervention:')
                  ? `Intervention : ${t.action.slice(13)}`
                  : ACTION_LABELS[t.action] || t.action;
              return (
                <li key={i} className="relative pl-3">
                  <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-panel bg-brand" />
                  <p className="text-sm font-medium text-white">{label}</p>
                  <p className="text-[11px] text-steel">
                    {fmtDateTime(t.at)}
                    {t.by ? ` · ${t.by.firstName} ${t.by.lastName}` : ''}
                  </p>
                  {t.note && <p className="mt-1 whitespace-pre-wrap text-sm text-steel-2">{t.note}</p>}
                </li>
              );
            })}
          </ol>
          <div className="space-y-2 border-t border-line p-4">
            <Textarea placeholder="Ajouter un commentaire…" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="flex justify-between">
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-steel hover:text-white">
                <Upload className="h-3.5 w-3.5" /> Joindre un fichier
                <input type="file" multiple accept="image/*,video/*,audio/*,application/pdf" className="hidden" onChange={(e) => addNote(e.target.files)} />
              </label>
              <Button size="sm" loading={busy === 'note'} onClick={() => addNote()} disabled={!note}>
                <MessageSquare className="h-3.5 w-3.5" /> Publier
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <Modal
        open={dispatchOpen}
        onClose={() => setDispatchOpen(false)}
        title="Envoyer une équipe d’intervention"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDispatchOpen(false)}>
              Annuler
            </Button>
            <Button loading={busy === 'dispatch'} onClick={dispatch} disabled={!dispatchForm.teamId && !dispatchForm.memberIds.length}>
              <Siren className="h-4 w-4" /> Envoyer
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Équipe">
            <Select value={dispatchForm.teamId} onChange={(e) => setDispatchForm({ ...dispatchForm, teamId: e.target.value })}>
              <option value="">— Aucune (intervenants individuels) —</option>
              {teams?.items.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} {t.callSign ? `(${t.callSign})` : ''} {t.available ? '· disponible' : '· en mission'}
                </option>
              ))}
            </Select>
          </Field>
          <div>
            <p className="mb-2 text-xs font-medium text-steel-2">Ou choisir des intervenants / agents</p>
            <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-lg border border-line p-3">
              {responders?.items.map((u) => (
                <Checkbox
                  key={u.id}
                  label={`${u.firstName} ${u.lastName}${u.onDuty ? ' · en service' : ''}`}
                  checked={dispatchForm.memberIds.includes(u.id)}
                  onChange={(e) =>
                    setDispatchForm((f) => ({
                      ...f,
                      memberIds: e.target.checked ? [...f.memberIds, u.id] : f.memberIds.filter((x) => x !== u.id),
                    }))
                  }
                />
              ))}
            </div>
          </div>
          <Field label="Consignes">
            <Textarea value={dispatchForm.instructions} onChange={(e) => setDispatchForm({ ...dispatchForm, instructions: e.target.value })} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!resolveOpen}
        onClose={() => setResolveOpen(null)}
        title={resolveOpen === 'cancelled' ? 'Annuler l’incident' : 'Résoudre l’incident'}
        footer={
          <Button
            onClick={async () => {
              await setStatus(resolveOpen as IncidentStatus, resolution);
              setResolveOpen(null);
              setResolution('');
            }}
          >
            Confirmer
          </Button>
        }
      >
        <Field label={resolveOpen === 'cancelled' ? 'Motif' : 'Résolution / mesures prises'}>
          <Textarea rows={4} value={resolution} onChange={(e) => setResolution(e.target.value)} />
        </Field>
      </Modal>
    </>
  );
}
