'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { CalendarClock, CalendarDays, LayoutGrid, List, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { DAYS } from '@/lib/format';
import type { PatrolRoute, RoundType, Schedule, Shift, User } from '@/lib/types';
import { Badge, Button, Card, Checkbox, Empty, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select, useToast } from '@/components/ui';
import PlanningCalendar from '@/components/PlanningCalendar';

type Mode = 'times' | 'every';
const empty = {
  route: '',
  name: '',
  shift: '',
  roundType: '',
  assignMode: 'single' as 'single' | 'pool',
  assignedAgent: '',
  agents: [] as string[],
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  mode: 'times' as Mode,
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
  const { data: shifts } = useApi<{ items: Shift[] }>('/shifts');
  const { data: roundTypes } = useApi<{ items: RoundType[] }>('/round-types', { active: true });
  const [open, setOpen] = useState<null | 'new' | Schedule>(null);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<'list' | 'week' | 'calendar'>('week');

  // Planning hebdomadaire : lundi → dimanche, une ligne par rondier affecté, une pastille par ronde.
  // Reconstruit à partir des plannings existants (chaque planning est déjà reproduit chaque semaine
  // via ses jours cochés) — aucune donnée supplémentaire n'est nécessaire.
  const weekRows = useMemo(() => {
    const items = data?.items.filter((s) => s.active) || [];
    type Cell = { key: string; time: string; routeName: string; roundType?: string };
    const byAgent = new Map<string, { label: string; days: Cell[][] }>();
    const order: string[] = [];
    for (const s of items) {
      const key = s.assignedAgent ? s.assignedAgent.id : s.agents.length ? `pool:${s.id}` : `libre:${s.id}`;
      const label = s.assignedAgent
        ? `${s.assignedAgent.firstName} ${s.assignedAgent.lastName}`
        : s.agents.length
          ? `Pool — ${s.agents.map((a) => `${a.firstName} ${a.lastName}`).join(', ')}`
          : `${s.route?.name || 'Planning'} (non affecté)`;
      if (!byAgent.has(key)) {
        byAgent.set(key, { label, days: Array.from({ length: 7 }, () => []) });
        order.push(key);
      }
      const row = byAgent.get(key)!;
      const times = s.startTimes.length ? s.startTimes : s.every?.minutes ? [`toutes les ${s.every.minutes} min`] : [];
      for (const d of s.daysOfWeek) {
        for (const t of times) {
          row.days[d].push({ key: `${s.id}-${d}-${t}`, time: t, routeName: s.route?.name || s.name || 'Ronde', roundType: (s.roundType as { name?: string })?.name });
        }
      }
    }
    for (const row of byAgent.values()) row.days.forEach((d) => d.sort((a, b) => a.time.localeCompare(b.time)));
    return order.map((k) => byAgent.get(k)!);
  }, [data]);

  function edit(s: 'new' | Schedule) {
    setOpen(s);
    if (s === 'new') setForm(empty);
    else
      setForm({
        route: s.route?.id || '',
        name: s.name || '',
        shift: s.shift?.id || '',
        roundType: s.roundType?.id || '',
        assignMode: s.assignedAgent ? 'single' : 'pool',
        assignedAgent: s.assignedAgent?.id || '',
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
      shift: form.shift || null,
      roundType: form.roundType || null,
      assignedAgent: form.assignMode === 'single' ? form.assignedAgent || null : null,
      agents: form.assignMode === 'pool' ? form.agents : [],
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
        subtitle="Chaque planning coché sur des jours précis (lundi → dimanche) est reproduit automatiquement chaque semaine ; les retards et rondes manquées remontent à la centrale"
        actions={
          <>
            <div className="flex overflow-hidden rounded-lg border border-line">
              <button
                onClick={() => setView('week')}
                className={clsx('flex items-center gap-1.5 px-3 py-1.5 text-xs', view === 'week' ? 'bg-brand text-white' : 'bg-transparent text-steel hover:text-white')}
              >
                <LayoutGrid className="h-3.5 w-3.5" /> Semaine
              </button>
              <button
                onClick={() => setView('list')}
                className={clsx('flex items-center gap-1.5 px-3 py-1.5 text-xs', view === 'list' ? 'bg-brand text-white' : 'bg-transparent text-steel hover:text-white')}
              >
                <List className="h-3.5 w-3.5" /> Liste
              </button>
              <button
                onClick={() => setView('calendar')}
                className={clsx('flex items-center gap-1.5 px-3 py-1.5 text-xs', view === 'calendar' ? 'bg-brand text-white' : 'bg-transparent text-steel hover:text-white')}
              >
                <CalendarDays className="h-3.5 w-3.5" /> Calendrier
              </button>
            </div>
            <Button onClick={() => edit('new')} disabled={!routes?.items.length}>
              <Plus className="h-4 w-4" /> Nouveau planning
            </Button>
          </>
        }
      />
      <ErrorBox error={error} />
      {loading && !data ? (
        <Loading />
      ) : view === 'calendar' ? (
        !routes?.items.length ? (
          <Card>
            <Empty>Créez d’abord un parcours de ronde dans un site.</Empty>
          </Card>
        ) : (
          <PlanningCalendar
            schedules={data?.items || []}
            routes={routes.items}
            agents={agents?.items || []}
            shifts={shifts?.items || []}
            roundTypes={roundTypes?.items || []}
          />
        )
      ) : !data?.items.length ? (
        <Card>
          <Empty>{routes?.items.length ? 'Aucun planning.' : 'Créez d’abord un parcours de ronde dans un site.'}</Empty>
        </Card>
      ) : view === 'week' ? (
        <Card title="Planning hebdomadaire — reproduit automatiquement chaque semaine">
          {!weekRows.length ? (
            <Empty>Aucun rondier affecté à un planning actif.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-steel">
                    <th className="px-3 py-2">Rondier</th>
                    {DAYS.map((d) => (
                      <th key={d} className="min-w-[130px] px-3 py-2">
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {weekRows.map((row) => (
                    <tr key={row.label} className="border-b border-line/60 align-top">
                      <td className="whitespace-nowrap px-3 py-2 font-medium text-white">{row.label}</td>
                      {row.days.map((cells, i) => (
                        <td key={i} className="px-3 py-2">
                          <div className="flex flex-col gap-1">
                            {cells.map((c) => (
                              <span key={c.key} className="rounded bg-zinc-900 px-1.5 py-1 text-[11px] text-steel-2">
                                <span className="font-medium text-white">{c.time}</span> · {c.routeName}
                                {c.roundType ? ` (${c.roundType})` : ''}
                              </span>
                            ))}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
                    Délai : {s.windowMinutes} min · Rondier :{' '}
                    {s.assignedAgent
                      ? `${s.assignedAgent.firstName} ${s.assignedAgent.lastName}`
                      : s.agents.length
                        ? `pool (${s.agents.map((a) => `${a.firstName} ${a.lastName}`).join(', ')})`
                        : 'tout rondier du site'}
                  </p>
                  {(s.shift || s.roundType) && (
                    <p className="mt-1 text-xs text-steel">
                      {s.shift && <>Shift : {(s.shift as { name?: string }).name} </>}
                      {s.roundType && <>· Type : {(s.roundType as { name?: string }).name}</>}
                    </p>
                  )}
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
          <div className="grid grid-cols-2 gap-3">
            <Field label="Shift" hint="La ronde est incluse dans ce shift">
              <Select value={form.shift} onChange={(e) => setForm({ ...form, shift: e.target.value })}>
                <option value="">—</option>
                {shifts?.items.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.startTime}–{s.endTime}) · {s.site?.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Type de ronde">
              <Select value={form.roundType} onChange={(e) => setForm({ ...form, roundType: e.target.value })}>
                <option value="">—</option>
                {roundTypes?.items.map((rt) => (
                  <option key={rt.id} value={rt.id}>
                    {rt.name}
                  </option>
                ))}
              </Select>
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
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" checked={form.mode === 'times'} onChange={() => setForm({ ...form, mode: 'times' })} className="accent-[#e92026]" /> Heures fixes
              <Badge tone="success">Recommandé</Badge>
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={form.mode === 'every'} onChange={() => setForm({ ...form, mode: 'every' })} className="accent-[#e92026]" /> Fréquence régulière
              <span className="text-[11px] text-steel">(ancien mode)</span>
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
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={form.assignMode === 'single'}
                onChange={() => setForm({ ...form, assignMode: 'single' })}
                className="accent-[#e92026]"
              />{' '}
              Rondier affecté directement
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={form.assignMode === 'pool'}
                onChange={() => setForm({ ...form, assignMode: 'pool' })}
                className="accent-[#e92026]"
              />{' '}
              Pool de rondiers (ancien mode)
            </label>
          </div>
          {form.assignMode === 'single' ? (
            <Field label="Rondier" hint="Vide = tout rondier du site peut démarrer la ronde">
              <Select value={form.assignedAgent} onChange={(e) => setForm({ ...form, assignedAgent: e.target.value })}>
                <option value="">—</option>
                {agents?.items.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.firstName} {a.lastName} {a.matricule ? `(${a.matricule})` : ''}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <div>
              <p className="mb-2 text-xs font-medium text-steel-2">Rondiers affectés (vide = tout rondier pouvant démarrer)</p>
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
          )}
          <Checkbox label="Planning actif" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
        </div>
      </Modal>
    </>
  );
}
