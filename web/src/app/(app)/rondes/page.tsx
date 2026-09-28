'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useSocketEvent } from '@/lib/socket';
import { durationMin, fmtDateTime } from '@/lib/format';
import type { Patrol, PatrolRoute, Site, User } from '@/lib/types';
import { Button, Card, Empty, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select, Table, Td, Textarea, Th, useToast } from '@/components/ui';
import { PatrolBadge } from '@/components/StatusBadges';

export default function RondesPage() {
  const router = useRouter();
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [site, setSite] = useState('');
  const [agent, setAgent] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useApi<{ items: Patrol[]; total: number }>('/patrols', {
    status: status || undefined,
    site: site || undefined,
    agent: agent || undefined,
    page,
    limit: 40,
  });
  const { data: sites } = useApi<{ items: Site[] }>('/sites');
  const { data: agents } = useApi<{ items: User[] }>('/users', { role: 'agent', active: true });
  const { data: routes } = useApi<{ items: PatrolRoute[] }>('/routes', { active: true });
  useSocketEvent('patrol:updated', () => reload(true));

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ route: '', agent: '', scheduledStart: '', windowMinutes: 60, notes: '' });
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      await api('/patrols', {
        body: {
          route: form.route,
          agent: form.agent || undefined,
          scheduledStart: form.scheduledStart ? new Date(form.scheduledStart).toISOString() : undefined,
          windowMinutes: Number(form.windowMinutes),
          notes: form.notes || undefined,
        },
      });
      toast('Ronde ordonnée — l’agent est notifié');
      setOpen(false);
      reload(true);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Rondes"
        subtitle="Rondes planifiées, en cours et historique d’exécution"
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Ordonner une ronde
          </Button>
        }
      />
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-line p-3">
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="!w-48">
            <option value="">Tous les statuts</option>
            <option value="scheduled">Planifiées</option>
            <option value="in_progress">En cours</option>
            <option value="completed">Complètes</option>
            <option value="incomplete">Incomplètes</option>
            <option value="missed">Manquées</option>
            <option value="cancelled">Annulées</option>
          </Select>
          <Select value={site} onChange={(e) => { setSite(e.target.value); setPage(1); }} className="!w-56">
            <option value="">Tous les sites</option>
            {sites?.items.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select value={agent} onChange={(e) => { setAgent(e.target.value); setPage(1); }} className="!w-56">
            <option value="">Tous les agents</option>
            {agents?.items.map((a) => (
              <option key={a.id} value={a.id}>
                {a.firstName} {a.lastName}
              </option>
            ))}
          </Select>
        </div>
        <ErrorBox error={error} />
        {loading && !data ? (
          <Loading />
        ) : !data?.items.length ? (
          <Empty>Aucune ronde.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Prévue</Th>
                <Th>Parcours</Th>
                <Th>Site</Th>
                <Th>Agent</Th>
                <Th>Points</Th>
                <Th>Durée</Th>
                <Th>Statut</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((p) => (
                <tr key={p.id} className="cursor-pointer hover:bg-white/5" onClick={() => router.push(`/rondes/${p.id}`)}>
                  <Td className="whitespace-nowrap">{fmtDateTime(p.scheduledStart)}</Td>
                  <Td className="text-white">{(p.route as { name?: string })?.name}</Td>
                  <Td>{(p.site as { name?: string })?.name}</Td>
                  <Td>{p.agent ? `${p.agent.firstName} ${p.agent.lastName}` : <span className="text-zinc-600">non attribuée</span>}</Td>
                  <Td className="tabular-nums">
                    {p.stats.done}/{p.stats.total}
                    {p.stats.suspicious > 0 && <span className="ml-1 text-amber-400">· {p.stats.suspicious} suspect(s)</span>}
                  </Td>
                  <Td>{p.startedAt ? durationMin(p.startedAt, p.endedAt) : '—'}</Td>
                  <Td>
                    <PatrolBadge status={p.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {data && data.total > 40 && (
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-xs text-steel">
            <span>{data.total} rondes</span>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                Précédent
              </Button>
              <Button size="sm" variant="secondary" disabled={page * 40 >= data.total} onClick={() => setPage((p) => p + 1)}>
                Suivant
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Ordonner une ronde ponctuelle"
        footer={
          <Button loading={busy} disabled={!form.route} onClick={create}>
            Envoyer à l’agent
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="Parcours">
            <Select value={form.route} onChange={(e) => setForm({ ...form, route: e.target.value })}>
              <option value="">— Choisir —</option>
              {routes?.items.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · {(r.site as { name?: string })?.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Agent (facultatif)">
            <Select value={form.agent} onChange={(e) => setForm({ ...form, agent: e.target.value })}>
              <option value="">— Le premier agent disponible —</option>
              {agents?.items.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.firstName} {a.lastName} {a.onDuty ? '· en service' : ''}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Début" hint="Vide = maintenant">
              <Input type="datetime-local" value={form.scheduledStart} onChange={(e) => setForm({ ...form, scheduledStart: e.target.value })} />
            </Field>
            <Field label="Délai pour terminer (min)">
              <Input type="number" min={5} value={form.windowMinutes} onChange={(e) => setForm({ ...form, windowMinutes: Number(e.target.value) })} />
            </Field>
          </div>
          <Field label="Consigne">
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </>
  );
}
