'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, GripVertical, Pencil, Plus, Trash2, UserX } from 'lucide-react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { fmtTime, PATROL_STATUS } from '@/lib/format';
import type { PatrolOccurrence, PatrolRoute, RoundType, Schedule, Shift, User } from '@/lib/types';
import { Badge, Button, Empty, ErrorBox, Field, Input, Loading, Modal, Select, useToast } from '@/components/ui';

const DOW = ['L', 'M', 'M', 'J', 'V', 'S', 'D']; // lundi → dimanche
const MONTHS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
/** Grille du mois, lundi en premier : tableau de semaines de 7 dates (déborde sur le mois voisin). */
function monthGrid(monthStart: Date) {
  const firstDow = (monthStart.getDay() + 6) % 7; // 0 = lundi
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - firstDow);
  const weeks: Date[][] = [];
  const cursor = new Date(gridStart);
  for (let w = 0; w < 6; w += 1) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i += 1) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

function agentLabel(a?: User | null) {
  if (!a) return null;
  return `${a.firstName} ${a.lastName}`;
}

type Props = {
  schedules: Schedule[];
  routes: PatrolRoute[];
  agents: User[];
  shifts: Shift[];
  roundTypes: RoundType[];
};

const emptyForm = { route: '', agent: '', shift: '', roundType: '', time: '08:00', windowMinutes: 60, notes: '' };

export default function PlanningCalendar({ schedules, routes, agents, shifts, roundTypes }: Props) {
  const toast = useToast();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selected, setSelected] = useState<Date | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState<PatrolOccurrence | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [dragOverShift, setDragOverShift] = useState<string>('');

  const selectedYmd = selected ? ymd(selected) : null;
  const { data, error, loading, reload } = useApi<{ date: string; items: PatrolOccurrence[]; corruptedCount?: number }>(
    selectedYmd ? '/patrols/day' : null,
    selectedYmd ? { date: selectedYmd } : undefined
  );

  // Jours ayant au moins un planning actif couvrant ce jour de semaine — pastille indicative sur le calendrier.
  const activeDows = useMemo(() => {
    const set = new Set<number>();
    for (const s of schedules) if (s.active) for (const d of s.daysOfWeek) set.add(d);
    return set;
  }, [schedules]);

  const weeks = useMemo(() => monthGrid(month), [month]);
  const today = new Date();

  const items = data?.items || [];
  const lanes = useMemo(() => {
    const byShift = new Map<string, { shift: { id: string; name: string } | null; items: PatrolOccurrence[] }>();
    for (const it of items) {
      const key = it.shift?.id || '__none__';
      if (!byShift.has(key)) byShift.set(key, { shift: it.shift ? { id: it.shift.id, name: it.shift.name || 'Shift' } : null, items: [] });
      byShift.get(key)!.items.push(it);
    }
    for (const lane of byShift.values()) lane.items.sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
    return [...byShift.values()].sort((a, b) => (a.shift ? 0 : 1) - (b.shift ? 0 : 1));
  }, [items]);

  function openAdd() {
    setForm({ ...emptyForm, route: routes[0]?.id || '' });
    setAddOpen(true);
  }

  async function submitAdd() {
    if (!selectedYmd || !form.route) return;
    setBusy(true);
    try {
      const scheduledStart = new Date(`${selectedYmd}T${form.time}:00`).toISOString();
      await api('/patrols', {
        body: {
          route: form.route,
          agent: form.agent || undefined,
          shift: form.shift || undefined,
          roundType: form.roundType || undefined,
          scheduledStart,
          windowMinutes: Number(form.windowMinutes),
          notes: form.notes || undefined,
        },
      });
      toast('Rondier ajouté à la journée');
      setAddOpen(false);
      reload(true);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  function openEdit(it: PatrolOccurrence) {
    setForm({
      route: typeof it.route === 'string' ? it.route : it.route.id,
      agent: it.agent?.id || '',
      shift: it.shift?.id || '',
      roundType: it.roundType?.id || '',
      time: fmtTime(it.scheduledStart),
      windowMinutes: it.dueBy ? Math.round((new Date(it.dueBy).getTime() - new Date(it.scheduledStart).getTime()) / 60000) : 60,
      notes: '',
    });
    setEditOpen(it);
  }

  async function submitEdit() {
    if (!editOpen || !selectedYmd) return;
    setBusy(true);
    try {
      const scheduledStart = new Date(`${selectedYmd}T${form.time}:00`).toISOString();
      await api(`/patrols/${editOpen.id}`, {
        method: 'PATCH',
        body: {
          route: form.route,
          agent: form.agent || null,
          shift: form.shift || null,
          roundType: form.roundType || null,
          scheduledStart,
          windowMinutes: Number(form.windowMinutes),
        },
      });
      toast('Ronde mise à jour');
      setEditOpen(null);
      reload(true);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function removeOccurrence(it: PatrolOccurrence) {
    if (!confirm(`Retirer ${agentLabel(it.agent) || 'ce rondier'} de cette journée ?`)) return;
    try {
      await api(`/patrols/${it.id}/cancel`, { body: {} });
      toast('Rondier retiré de la journée');
      reload(true);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  // Glisser-déposer : changer le shift d'un rondier en le déplaçant d'un bloc à l'autre.
  async function dropOnShift(occurrenceId: string, shiftId: string) {
    setDragOverShift('');
    try {
      await api(`/patrols/${occurrenceId}`, { method: 'PATCH', body: { shift: shiftId || null } });
      toast('Shift mis à jour');
      reload(true);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line bg-panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">
            {MONTHS[month.getMonth()]} {month.getFullYear()}
          </h2>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setMonth(new Date(today.getFullYear(), today.getMonth(), 1))}>
              Aujourd’hui
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-steel">
          {DOW.map((d, i) => (
            <div key={i} className="py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {weeks.map((week, wi) =>
            week.map((d, di) => {
              const inMonth = d.getMonth() === month.getMonth();
              const isToday = sameDay(d, today);
              const hasSchedule = activeDows.has(d.getDay());
              return (
                <button
                  key={`${wi}-${di}`}
                  onClick={() => setSelected(d)}
                  className={clsx(
                    'flex h-16 flex-col items-center justify-start gap-1 rounded-lg border px-1 pt-1.5 text-sm transition',
                    inMonth ? 'border-line/60 bg-ink text-white' : 'border-transparent text-zinc-700',
                    isToday && 'border-brand/70',
                    'hover:border-brand hover:bg-brand/5'
                  )}
                >
                  <span className={clsx(isToday && 'flex h-6 w-6 items-center justify-center rounded-full bg-brand text-white')}>{d.getDate()}</span>
                  {hasSchedule && inMonth && <span className="h-1.5 w-1.5 rounded-full bg-brand" />}
                </button>
              );
            })
          )}
        </div>
      </div>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        wide
        title={selected ? `Rondiers du ${selected.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}` : ''}
        footer={
          <Button onClick={openAdd} disabled={!routes.length}>
            <Plus className="h-4 w-4" /> Ajouter un rondier
          </Button>
        }
      >
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorBox error={error} />
        ) : !items.length ? (
          <Empty>Aucun rondier affecté ce jour-là. Utilisez « Ajouter un rondier » ci-dessous.</Empty>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-steel">Glissez une carte d’un bloc à l’autre pour changer le shift du rondier.</p>
            {!!data?.corruptedCount && (
              <Badge tone="warning">
                {data.corruptedCount} ronde(s) de ce jour ignorée(s) — donnée abîmée (référence invalide), à vérifier côté serveur.
              </Badge>
            )}
            {lanes.map((lane) => (
              <div
                key={lane.shift?.id || '__none__'}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverShift(lane.shift?.id || '__none__');
                }}
                onDragLeave={() => setDragOverShift('')}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData('text/plain');
                  if (id) dropOnShift(id, lane.shift?.id || '');
                }}
                className={clsx(
                  'rounded-lg border p-3 transition',
                  dragOverShift === (lane.shift?.id || '__none__') ? 'border-brand bg-brand/5' : 'border-line/60'
                )}
              >
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-steel-2">{lane.shift ? lane.shift.name : 'Sans shift'}</p>
                <div className="space-y-2">
                  {lane.items.map((it) => {
                    const st = PATROL_STATUS[it.status];
                    return (
                      <div
                        key={it.id}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData('text/plain', it.id)}
                        className="flex items-center gap-3 rounded-lg border border-line bg-ink px-3 py-2"
                      >
                        <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-steel" />
                        {it.agent?.photo?.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={it.agent.photo.url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                        ) : (
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/15 text-[11px] font-bold text-brand">
                            {it.agent ? `${it.agent.firstName[0]}${it.agent.lastName[0]}` : <UserX className="h-4 w-4" />}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-white">
                            {agentLabel(it.agent) || 'Non affecté'}
                            {it.agent?.matricule && <span className="ml-1.5 font-mono text-[11px] text-steel">{it.agent.matricule}</span>}
                            {it.agent && !it.agent.active && <Badge tone="warning" className="ml-1.5">compte désactivé</Badge>}
                          </p>
                          <p className="truncate text-xs text-steel">
                            {fmtTime(it.scheduledStart)} · {typeof it.route === 'string' ? it.route : it.route.name}
                            {it.roundType && typeof it.roundType !== 'string' && ` · ${it.roundType.name}`}
                          </p>
                          <p className="text-[11px] text-steel">
                            Points : {it.stats.done}/{it.stats.total} {it.virtual && <span className="text-steel">· créneau à venir</span>}
                          </p>
                        </div>
                        {st && (
                          <Badge tone={st.tone} className="shrink-0">
                            {st.label}
                          </Badge>
                        )}
                        <div className="flex shrink-0 gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(it)} title="Modifier">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => removeOccurrence(it)} title="Retirer">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Ajouter un rondier à la journée sélectionnée */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Ajouter un rondier à cette journée"
        footer={
          <Button loading={busy} disabled={!form.route} onClick={submitAdd}>
            Ajouter
          </Button>
        }
      >
        <OccurrenceFields form={form} setForm={setForm} routes={routes} agents={agents} shifts={shifts} roundTypes={roundTypes} />
      </Modal>

      {/* Modifier un rondier déjà affecté */}
      <Modal
        open={!!editOpen}
        onClose={() => setEditOpen(null)}
        title="Modifier l’affectation"
        footer={
          <Button loading={busy} disabled={!form.route} onClick={submitEdit}>
            Enregistrer
          </Button>
        }
      >
        <OccurrenceFields form={form} setForm={setForm} routes={routes} agents={agents} shifts={shifts} roundTypes={roundTypes} />
      </Modal>
    </div>
  );
}

function OccurrenceFields({
  form,
  setForm,
  routes,
  agents,
  shifts,
  roundTypes,
}: {
  form: typeof emptyForm;
  setForm: (f: typeof emptyForm) => void;
  routes: PatrolRoute[];
  agents: User[];
  shifts: Shift[];
  roundTypes: RoundType[];
}) {
  return (
    <div className="space-y-3">
      <Field label="Parcours *">
        <Select value={form.route} onChange={(e) => setForm({ ...form, route: e.target.value })}>
          <option value="">— Choisir —</option>
          {routes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} · {(r.site as { name?: string })?.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Rondier" hint="Vide = non affecté">
          <Select value={form.agent} onChange={(e) => setForm({ ...form, agent: e.target.value })}>
            <option value="">—</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.firstName} {a.lastName} {a.matricule ? `(${a.matricule})` : ''}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Heure de départ">
          <Input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Shift">
          <Select value={form.shift} onChange={(e) => setForm({ ...form, shift: e.target.value })}>
            <option value="">—</option>
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.startTime}–{s.endTime})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Type de ronde">
          <Select value={form.roundType} onChange={(e) => setForm({ ...form, roundType: e.target.value })}>
            <option value="">—</option>
            {roundTypes.map((rt) => (
              <option key={rt.id} value={rt.id}>
                {rt.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Délai pour réaliser la ronde (min)">
        <Input type="number" min={5} value={form.windowMinutes} onChange={(e) => setForm({ ...form, windowMinutes: Number(e.target.value) })} />
      </Field>
    </div>
  );
}
