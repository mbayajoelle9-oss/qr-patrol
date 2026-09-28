'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useSocketEvent } from '@/lib/socket';
import { fmtDateTime, timeAgo } from '@/lib/format';
import type { Incident, Meta, Site } from '@/lib/types';
import { Button, Card, Empty, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select, Table, Td, Textarea, Th, useToast } from '@/components/ui';
import { IncidentBadge, SeverityBadge } from '@/components/StatusBadges';

export default function IncidentsPage() {
  const router = useRouter();
  const toast = useToast();
  const [status, setStatus] = useState('open');
  const [severity, setSeverity] = useState('');
  const [site, setSite] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useApi<{ items: Incident[]; total: number }>('/incidents', {
    status: status || undefined,
    severity: severity || undefined,
    site: site || undefined,
    page,
    limit: 30,
  });
  const { data: sites } = useApi<{ items: Site[] }>('/sites');
  const { data: meta } = useApi<Meta>('/meta');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ type: 'intrusion', severity: 'medium', siteId: '', description: '', title: '' });
  const [busy, setBusy] = useState(false);

  useSocketEvent('incident:new', () => reload(true));
  useSocketEvent('incident:updated', () => reload(true));

  async function create() {
    setBusy(true);
    try {
      const { incident } = await api<{ incident: Incident }>('/incidents', {
        body: { ...form, siteId: form.siteId || undefined, title: form.title || undefined },
      });
      toast(`Incident ${incident.reference} créé`);
      router.push(`/incidents/${incident.id}`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Incidents"
        subtitle="Déclarations des agents, SOS et incidents saisis par la centrale"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Nouvel incident
          </Button>
        }
      />
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-line p-3">
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="!w-48">
            <option value="open">En cours</option>
            <option value="">Tous les statuts</option>
            {meta?.incidentStatuses.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
          <Select value={severity} onChange={(e) => { setSeverity(e.target.value); setPage(1); }} className="!w-44">
            <option value="">Toutes gravités</option>
            {meta?.severities.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
          <Select value={site} onChange={(e) => { setSite(e.target.value); setPage(1); }} className="!w-56">
            <option value="">Tous les sites</option>
            {sites?.items.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        <ErrorBox error={error} />
        {loading && !data ? (
          <Loading />
        ) : !data?.items.length ? (
          <Empty>Aucun incident.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Référence</Th>
                <Th>Type</Th>
                <Th>Gravité</Th>
                <Th>Site</Th>
                <Th>Déclaré par</Th>
                <Th>Date</Th>
                <Th>Médias</Th>
                <Th>Statut</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((i) => (
                <tr key={i.id} className="cursor-pointer hover:bg-white/5" onClick={() => router.push(`/incidents/${i.id}`)}>
                  <Td className="font-mono text-xs text-white">
                    <Link href={`/incidents/${i.id}`}>{i.reference}</Link>
                  </Td>
                  <Td className={i.type === 'sos' ? 'font-bold text-brand' : 'text-white'}>{i.typeLabel}</Td>
                  <Td>
                    <SeverityBadge severity={i.severity} />
                  </Td>
                  <Td>{i.site?.name || '—'}</Td>
                  <Td>
                    {i.reportedBy?.firstName} {i.reportedBy?.lastName}
                  </Td>
                  <Td title={fmtDateTime(i.createdAt)}>{timeAgo(i.createdAt)}</Td>
                  <Td>{i.media.length || '—'}</Td>
                  <Td>
                    <IncidentBadge status={i.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {data && data.total > 30 && (
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-xs text-steel">
            <span>{data.total} incidents</span>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                Précédent
              </Button>
              <Button size="sm" variant="secondary" disabled={page * 30 >= data.total} onClick={() => setPage((p) => p + 1)}>
                Suivant
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Nouvel incident (saisie centrale)"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Annuler
            </Button>
            <Button loading={busy} onClick={create}>
              Créer
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {meta?.incidentTypes.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Gravité">
              <Select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                {meta?.severities.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Site">
            <Select value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })}>
              <option value="">—</option>
              {sites?.items.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Titre (facultatif)">
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="Description">
            <Textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </>
  );
}
