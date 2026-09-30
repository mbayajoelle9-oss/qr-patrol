'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { Clock, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { DAYS } from '@/lib/format';
import type { Shift, Site, User } from '@/lib/types';
import { Badge, Button, Card, Checkbox, Empty, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select, useToast } from '@/components/ui';

const empty = {
  site: '',
  name: '',
  startTime: '18:00',
  endTime: '06:00',
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  rondiers: [] as string[],
  active: true,
};

export default function ShiftsPage() {
  const toast = useToast();
  const { isAdmin } = useAuth();
  const { data, loading, error, reload } = useApi<{ items: Shift[] }>('/shifts');
  const { data: sites } = useApi<{ items: Site[] }>('/sites');
  const { data: rondiers } = useApi<{ items: User[] }>('/users', { role: 'agent', active: true });
  const [open, setOpen] = useState<null | 'new' | Shift>(null);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);

  function edit(s: 'new' | Shift) {
    setOpen(s);
    if (s === 'new') setForm(empty);
    else
      setForm({
        site: s.site?.id || '',
        name: s.name,
        startTime: s.startTime,
        endTime: s.endTime,
        daysOfWeek: s.daysOfWeek,
        rondiers: s.rondiers.map((r) => r.id),
        active: s.active,
      });
  }

  async function save() {
    setBusy(true);
    try {
      if (open === 'new') await api('/shifts', { body: form });
      else if (open) await api(`/shifts/${open.id}`, { method: 'PATCH', body: form });
      toast('Shift enregistré');
      setOpen(null);
      reload(true);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function remove(s: Shift) {
    if (!confirm(`Supprimer le shift « ${s.name} » ?`)) return;
    try {
      await api(`/shifts/${s.id}`, { method: 'DELETE' });
      reload(true);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  return (
    <>
      <PageHeader
        title="Shifts"
        subtitle="Les rondes sont incluses dans un shift (vacation) : un créneau de travail sur un site, avec ses rondiers affectés"
        actions={
          isAdmin && (
            <Button onClick={() => edit('new')} disabled={!sites?.items.length}>
              <Plus className="h-4 w-4" /> Nouveau shift
            </Button>
          )
        }
      />
      <ErrorBox error={error} />
      {loading && !data ? (
        <Loading />
      ) : !data?.items.length ? (
        <Card>
          <Empty>{sites?.items.length ? 'Aucun shift.' : 'Créez d’abord un site.'}</Empty>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.items.map((s) => (
            <Card key={s.id} className={clsx(!s.active && 'opacity-50')}>
              <div className="flex items-start gap-4 p-4">
                <Clock className="mt-1 h-5 w-5 text-brand" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white">
                    {s.name} {!s.active && <Badge>Suspendu</Badge>}
                  </p>
                  <p className="text-sm text-steel">{s.site?.name}</p>
                  <p className="mt-2 text-sm text-steel-2">
                    {s.startTime} — {s.endTime}
                  </p>
                  <div className="mt-2 flex gap-1">
                    {DAYS.map((d, i) => (
                      <span key={d} className={clsx('rounded px-1.5 py-0.5 text-[10px]', s.daysOfWeek.includes(i) ? 'bg-brand/20 text-white' : 'bg-zinc-900 text-zinc-600')}>
                        {d}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-steel">
                    Rondiers : {s.rondiers.length ? s.rondiers.map((r) => `${r.firstName} ${r.lastName}`).join(', ') : 'aucun affecté'}
                  </p>
                </div>
                {isAdmin && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => edit(s)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(s)}>
                      <Trash2 className="h-4 w-4" />
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
        title={open === 'new' ? 'Nouveau shift' : 'Modifier le shift'}
        footer={
          <Button loading={busy} disabled={!form.site || !form.name} onClick={save}>
            Enregistrer
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="Site *">
            <Select value={form.site} onChange={(e) => setForm({ ...form, site: e.target.value })}>
              <option value="">— Choisir —</option>
              {sites?.items.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Nom *" hint="Ex. Nuit, Jour, Week-end">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Début">
              <Input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
            </Field>
            <Field label="Fin" hint="Peut passer minuit">
              <Input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
            </Field>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-steel-2">Jours</p>
            <div className="flex gap-1.5">
              {DAYS.map((d, i) => (
                <button
                  key={d}
                  type="button"
                  onClick={() =>
                    setForm((f) => ({ ...f, daysOfWeek: f.daysOfWeek.includes(i) ? f.daysOfWeek.filter((x) => x !== i) : [...f.daysOfWeek, i].sort() }))
                  }
                  className={clsx('rounded-md px-2.5 py-1.5 text-xs', form.daysOfWeek.includes(i) ? 'bg-brand text-white' : 'bg-zinc-800 text-steel')}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-steel-2">Rondiers affectés à ce shift</p>
            <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-lg border border-line p-3">
              {rondiers?.items.map((r) => (
                <Checkbox
                  key={r.id}
                  label={`${r.firstName} ${r.lastName} ${r.matricule ? `(${r.matricule})` : ''}`}
                  checked={form.rondiers.includes(r.id)}
                  onChange={(e) => setForm((f) => ({ ...f, rondiers: e.target.checked ? [...f.rondiers, r.id] : f.rondiers.filter((x) => x !== r.id) }))}
                />
              ))}
            </div>
          </div>
          {open !== 'new' && <Checkbox label="Shift actif" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />}
        </div>
      </Modal>
    </>
  );
}
