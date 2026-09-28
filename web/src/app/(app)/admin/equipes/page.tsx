'use client';

import { useState } from 'react';
import { Pencil, Phone, Plus, Truck, UsersRound } from 'lucide-react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import type { Site, Team, User } from '@/lib/types';
import { Badge, Button, Card, Checkbox, Empty, ErrorBox, Field, Input, Loading, Modal, PageHeader, useToast } from '@/components/ui';

const empty = { name: '', callSign: '', vehicle: '', phone: '', members: [] as string[], sites: [] as string[], available: true };

export default function TeamsPage() {
  const toast = useToast();
  const { isAdmin } = useAuth();
  const { data, loading, error, reload } = useApi<{ items: Team[] }>('/teams');
  const { data: users } = useApi<{ items: User[] }>('/users', { role: 'responder,agent', active: true });
  const { data: sites } = useApi<{ items: Site[] }>('/sites');
  const [open, setOpen] = useState<null | 'new' | Team>(null);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);

  function edit(t: 'new' | Team) {
    setOpen(t);
    setForm(
      t === 'new'
        ? empty
        : {
            name: t.name,
            callSign: t.callSign || '',
            vehicle: t.vehicle || '',
            phone: t.phone || '',
            members: t.members.map((m) => m.id),
            sites: t.sites.map((s) => s.id),
            available: t.available,
          }
    );
  }

  async function save() {
    setBusy(true);
    try {
      if (open === 'new') await api('/teams', { body: form });
      else if (open) await api(`/teams/${open.id}`, { method: 'PATCH', body: form });
      toast('Équipe enregistrée');
      setOpen(null);
      reload(true);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function toggle(t: Team) {
    await api(`/teams/${t.id}`, { method: 'PATCH', body: { available: !t.available } });
    reload(true);
  }

  return (
    <>
      <PageHeader
        title="Équipes d’intervention"
        subtitle="Équipes dépêchées par la centrale en cas d’incident"
        actions={
          isAdmin && (
            <Button onClick={() => edit('new')}>
              <Plus className="h-4 w-4" /> Nouvelle équipe
            </Button>
          )
        }
      />
      <ErrorBox error={error} />
      {loading && !data ? (
        <Loading />
      ) : !data?.items.length ? (
        <Card>
          <Empty>Aucune équipe.</Empty>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.items.map((t) => (
            <Card key={t.id}>
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/15 text-brand">
                      <UsersRound className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-white">{t.name}</p>
                      {t.callSign && <p className="font-mono text-xs text-steel">{t.callSign}</p>}
                    </div>
                  </div>
                  <button onClick={() => toggle(t)}>
                    <Badge tone={t.available ? 'success' : 'warning'}>{t.available ? 'Disponible' : 'En mission'}</Badge>
                  </button>
                </div>
                <div className="mt-3 space-y-1 text-sm text-steel">
                  {t.vehicle && (
                    <p>
                      <Truck className="mr-1.5 inline h-3.5 w-3.5" />
                      {t.vehicle}
                    </p>
                  )}
                  {t.phone && (
                    <p>
                      <Phone className="mr-1.5 inline h-3.5 w-3.5" />
                      {t.phone}
                    </p>
                  )}
                  <p className="text-steel-2">{t.members.map((m) => `${m.firstName} ${m.lastName}`).join(', ') || 'Aucun membre'}</p>
                  {t.sites.length > 0 && <p className="text-xs">Zone : {t.sites.map((s) => s.name).join(', ')}</p>}
                </div>
                {isAdmin && (
                  <div className="mt-3 text-right">
                    <Button size="sm" variant="ghost" onClick={() => edit(t)}>
                      <Pencil className="h-4 w-4" /> Modifier
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={!!open}
        onClose={() => setOpen(null)}
        title={open === 'new' ? 'Nouvelle équipe' : 'Modifier l’équipe'}
        footer={
          <Button loading={busy} disabled={!form.name} onClick={save}>
            Enregistrer
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nom *">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Indicatif radio">
              <Input value={form.callSign} onChange={(e) => setForm({ ...form, callSign: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Véhicule">
              <Input value={form.vehicle} onChange={(e) => setForm({ ...form, vehicle: e.target.value })} />
            </Field>
            <Field label="Téléphone">
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-steel-2">Membres</p>
            <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-lg border border-line p-3">
              {users?.items.map((u) => (
                <Checkbox
                  key={u.id}
                  label={`${u.firstName} ${u.lastName} · ${u.role === 'responder' ? 'intervenant' : 'agent'}`}
                  checked={form.members.includes(u.id)}
                  onChange={(e) => setForm((f) => ({ ...f, members: e.target.checked ? [...f.members, u.id] : f.members.filter((x) => x !== u.id) }))}
                />
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-steel-2">Sites couverts</p>
            <div className="max-h-32 space-y-1.5 overflow-y-auto rounded-lg border border-line p-3">
              {sites?.items.map((s) => (
                <Checkbox
                  key={s.id}
                  label={s.name}
                  checked={form.sites.includes(s.id)}
                  onChange={(e) => setForm((f) => ({ ...f, sites: e.target.checked ? [...f.sites, s.id] : f.sites.filter((x) => x !== s.id) }))}
                />
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
