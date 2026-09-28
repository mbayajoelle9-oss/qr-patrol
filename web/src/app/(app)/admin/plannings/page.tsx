'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { CalendarClock, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { DAYS } from '@/lib/format';
import type { PatrolRoute, Schedule, User } from '@/lib/types';
import { Badge, Button, Card, Checkbox, Empty, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select, useToast } from '@/components/ui';

type Mode = 'times' | 'every';
const empty = {
  route: '',
  name: '',
  agents: [] as string[],
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  mode: 'every' as Mode,
  startTimes: '08:00, 12:00, 16:00',
  everyMinutes: 120,
  fromTime: '18:00',
  toTime: '06:00',
  windowMinutes: 60,
  active: true,
};

export default function PlanningsPage() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi<{ items: Schedule[] }>('/schedules');
  const { data: routes } = useApi<{ items: PatrolRoute[] }>('/routes', { active: true });
  const { data: agents } = useApi<{ items: User[] }>('/users', { role: 'agent', active: true });
  const [open, setOpen] = useState<null | 'new' | Schedule>(null);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);

  function edit(s: 'new' | Schedule) {
    setOpen(s);
    if (s === 'new') setForm(empty);
    else
      setForm({
        route: s.route?.id || '',
        name: s.name || '',
        agents: s.agents.map((a) => a.id),
        daysOfWeek: s.daysOfWeek,
        mode: s.every?.minutes ? 'every' : 'times',
        startTimes: s.startTimes.join(', '),
        everyMinutes: s.every?.minutes || 120,
        fromTime: s.every?.fromTime || '18:00',
        toTime: s.every?.toTime || '06:00',
        windowMinutes: s.windowMinutes,
        active: s.active,
      });
  }

  async function save() {
    setBusy(true);
    const body = {
      route: form.route,
      name: form.name || undefined,
      agents: form.agents,
      daysOfWeek: form.daysOfWeek,
      startTimes:
        form.mode === 'times'
          ? form.startTimes
              .split(/[,\s]+/)
              .map((t) => t.trim())
              .filter(Boolean)
          : [],
      every: form.mode === 'every' ? { minutes: Number(form.everyMinutes), fromTime: form.fromTime, toTime: form.toTime } : null,
      windowMinutes: Number(form.windowMinutes),
      active: form.active,
    };
    try {
      if (open === 'new') await api('/schedules', { body });
      else if (open) await api(`/schedules/${open.id}`, { method: 'PATCH', body });
      toast('Planning enregistré — les rondes des prochaines 24 h sont générées automatiquement');
      setOpen(null);
      reload(true);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function remove(s: Schedule) {
    if (!confirm('Supprimer ce planning ? Les rondes déjà générées restent visibles.')) return;
    await api(`/schedules/${s.id}`, { method: 'DELETE' });
    reload(true);
  }

  const describe = (s: Schedule) =>
    s.every?.minutes
      ? `Toutes les ${s.every.minutes >= 60 && s.every.minutes % 60 === 0 ? `${s.every.minutes / 60} h` : `${s.every.minutes} min`} de ${s.every.fromTime} à ${s.every.toTime}`
      : `À ${s.startTimes.join(', ')}`;

  return (
    <>
      <PageHeader
        title="Plannings des rondes"
        subtitle="Les rondes sont créées automatiquement selon ces horaires ; les retards et rondes manquées remontent à la centrale"
        actions={
          <Button onClick={() => edit('new')} disabled={!routes?.items.length}>
            <Plus className="h-4 w-4" /> Nouveau planning
          </Button>
        }
      />
      <ErrorBox error={error} />
      {loading && !data ? (
        <Loading />
      ) : !data?.items.length ? (
        <Card>
          <Empty>{routes?.items.length ? 'Aucun planning.' : 'Créez d’abord un parcours de ronde dans un site.'}</Empty>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.items.map((s) => (
            <Card key={s.id} className={clsx(!s.active && 'opacity-50')}>
              <div className="flex items-start gap-4 p-4">
                <CalendarClock className="mt-1 h-5 w-5 text-brand" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white">
                    {s.name || s.route?.name} {!s.active && <Badge>Suspendu</Badge>}
                  </p>
                  <p className="text-sm text-steel">
                    {s.route?.name} · {s.site?.name}
                  </p>
                  <p className="mt-2 text-sm text-steel-2">{describe(s)}</p>
                  <div className="mt-2 flex gap-1">
                    {DAYS.map((d, i) => (
                      <span key={d} className={clsx('rounded px-1.5 py-0.5 text-[10px]', s.daysOfWeek.includes(i) ? 'bg-brand/20 text-white' : 'bg-zinc-900 text-zinc-600')}>
                        {d}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-steel">
                    Délai : {s.windowMinutes} min · Agents : {s.agents.length ? s.agents.map((a) => `${a.firstName} ${a.lastName}`).join(', ') : 'tous les agents du site'}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => edit(s)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(s)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={!!open}
        onClose={() => setOpen(null)}
        title={open === 'new' ? 'Nouveau planning' : 'Modifier le planning'}
        footer={
          <Button loading={busy} disabled={!form.route || !form.daysOfWeek.length} onClick={save}>
            Enregistrer
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="Parcours *">
            <Select value={form.route} onChange={(e) => setForm({ ...form, route: e.target.value })}>
              <option value="">— Choisir —</option>
              {routes?.items.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · {(r.site as { name?: string })?.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Nom">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Rondes de nuit" />
          </Field>
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
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" checked={form.mode === 'every'} onChange={() => setForm({ ...form, mode: 'every' })} className="accent-[#e92026]" /> Fréquence régulière
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={form.mode === 'times'} onChange={() => setForm({ ...form, mode: 'times' })} className="accent-[#e92026]" /> Heures fixes
            </label>
          </div>
          {form.mode === 'every' ? (
            <div className="grid grid-cols-3 gap-3">
              <Field label="Toutes les (min)">
                <Input type="number" min={10} value={form.everyMinutes} onChange={(e) => setForm({ ...form, everyMinutes: Number(e.target.value) })} />
              </Field>
              <Field label="De">
                <Input type="time" value={form.fromTime} onChange={(e) => setForm({ ...form, fromTime: e.target.value })} />
              </Field>
              <Field label="À" hint="Peut passer minuit">
                <Input type="time" value={form.toTime} onChange={(e) => setForm({ ...form, toTime: e.target.value })} />
              </Field>
            </div>
          ) : (
            <Field label="Heures de départ" hint="Séparées par des virgules, ex. 06:00, 10:00, 14:00, 22:00">
              <Input value={form.startTimes} onChange={(e) => setForm({ ...form, startTimes: e.target.value })} />
            </Field>
          )}
          <Field label="Délai pour réaliser la ronde (min)" hint="Au-delà, la ronde non démarrée est déclarée manquée">
            <Input type="number" min={5} value={form.windowMinutes} onChange={(e) => setForm({ ...form, windowMinutes: Number(e.target.value) })} />
          </Field>
          <div>
            <p className="mb-2 text-xs font-medium text-steel-2">Agents affectés (vide = tout agent pouvant démarrer)</p>
            <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-lg border border-line p-3">
              {agents?.items.map((a) => (
                <Checkbox
                  key={a.id}
                  label={`${a.firstName} ${a.lastName} ${a.matricule ? `(${a.matricule})` : ''}`}
                  checked={form.agents.includes(a.id)}
                  onChange={(e) => setForm((f) => ({ ...f, agents: e.target.checked ? [...f.agents, a.id] : f.agents.filter((x) => x !== a.id) }))}
                />
              ))}
            </div>
          </div>
          <Checkbox label="Planning actif" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
        </div>
      </Modal>
    </>
  );
}
