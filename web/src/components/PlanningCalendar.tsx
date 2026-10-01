'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, GripVertical, Pencil, Plus, Printer, Trash2, UserX } from 'lucide-react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { fmtTime, PATROL_STATUS } from '@/lib/format';
import type { PatrolOccurrence, PatrolRoute, RoundType, Schedule, Shift, User } from '@/lib/types';
import { Badge, Button, Empty, ErrorBox, Field, Input, Loading, Modal, Select, useToast } from '@/components/ui';

const DOW = ['L', 'M', 'M', 'J', 'V', 'S', 'D']; // lundi → dimanche
const DOW_FULL = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MONTHS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

type ViewMode = 'day' | 'workweek' | 'week' | 'month';

const HOUR_HEIGHT = 52; // px par heure dans la grille Jour/Semaine
const HOURS = Array.from({ length: 24 }, (_, h) => h);

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function startOfWeekMonday(d: Date) {
  const dow = (d.getDay() + 6) % 7; // 0 = lundi
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() - dow);
  return r;
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
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
function visibleDaysFor(view: ViewMode, anchor: Date): Date[] {
  if (view === 'day') return [new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())];
  const start = startOfWeekMonday(anchor);
  const count = view === 'workweek' ? 5 : 7;
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}
function rangeTitle(view: ViewMode, days: Date[], anchor: Date) {
  if (view === 'month') return `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`;
  if (view === 'day') {
    return anchor.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  }
  const first = days[0];
  const last = days[days.length - 1];
  const y = last.getFullYear();
  const sameMonth = first.getMonth() === last.getMonth();
  return sameMonth
    ? `${y}, ${MONTHS[first.getMonth()].toLowerCase()} ${first.getDate()} – ${last.getDate()}`
    : `${y}, ${MONTHS[first.getMonth()].toLowerCase()} ${first.getDate()} – ${MONTHS[last.getMonth()].toLowerCase()} ${last.getDate()}`;
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

/** Répartit les occurrences d'un jour en colonnes qui ne se chevauchent pas (comme Outlook). */
function layoutDayEvents(events: PatrolOccurrence[]) {
  const sorted = [...events].sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
  const colEnd: number[] = [];
  const placed: { ev: PatrolOccurrence; col: number }[] = [];
  for (const ev of sorted) {
    const start = new Date(ev.scheduledStart).getTime();
    const end = new Date(ev.dueBy || ev.scheduledStart).getTime();
    let col = colEnd.findIndex((e) => e <= start);
    if (col === -1) {
      col = colEnd.length;
      colEnd.push(end);
    } else {
      colEnd[col] = end;
    }
    placed.push({ ev, col });
  }
  const totalCols = colEnd.length || 1;
  return placed.map((p) => ({ ...p, totalCols }));
}

export default function PlanningCalendar({ schedules, routes, agents, shifts, roundTypes }: Props) {
  const toast = useToast();
  const [view, setView] = useState<ViewMode>('week');
  const [anchor, setAnchor] = useState<Date>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  });
  const today = new Date();

  const [selected, setSelected] = useState<Date | null>(null); // panneau « jour » (vue Mois)
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState<PatrolOccurrence | null>(null);
  const [formDate, setFormDate] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [dragOverShift, setDragOverShift] = useState<string>('');
  const [dragOverCell, setDragOverCell] = useState<string>('');

  const selectedYmd = selected ? ymd(selected) : null;
  const { data, error, loading, reload } = useApi<{ date: string; items: PatrolOccurrence[]; corruptedCount?: number }>(
    selectedYmd ? '/patrols/day' : null,
    selectedYmd ? { date: selectedYmd } : undefined
  );

  // --- Grille Jour / Semaine de travail / Semaine : récupère les occurrences de chaque jour visible ---
  const visibleDays = useMemo(() => visibleDaysFor(view, anchor), [view, anchor]);
  const visibleYmds = useMemo(() => visibleDays.map(ymd), [visibleDays]);
  const [rangeItems, setRangeItems] = useState<Record<string, PatrolOccurrence[]>>({});
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeError, setRangeError] = useState<Error | null>(null);

  const loadRange = useCallback(async () => {
    if (view === 'month') return;
    setRangeLoading(true);
    setRangeError(null);
    try {
      const results = await Promise.all(
        visibleYmds.map((d) => api<{ items: PatrolOccurrence[] }>('/patrols/day', { query: { date: d } }))
      );
      const map: Record<string, PatrolOccurrence[]> = {};
      visibleYmds.forEach((d, i) => {
        map[d] = results[i].items;
      });
      setRangeItems(map);
    } catch (e) {
      setRangeError(e as Error);
    } finally {
      setRangeLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleYmds.join('|'), view]);

  useEffect(() => {
    loadRange();
  }, [loadRange]);

  function refreshAll() {
    reload(true);
    loadRange();
  }

  // Jours ayant au moins un planning actif couvrant ce jour de semaine — pastille indicative sur le calendrier mensuel.
  const activeDows = useMemo(() => {
    const set = new Set<number>();
    for (const s of schedules) if (s.active) for (const d of s.daysOfWeek) set.add(d);
    return set;
  }, [schedules]);

  const monthWeeks = useMemo(() => monthGrid(startOfMonth(anchor)), [anchor]);

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

  // --- Navigation ---
  function goToday() {
    setAnchor(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  }
  function goPrev() {
    if (view === 'month') setAnchor((a) => new Date(a.getFullYear(), a.getMonth() - 1, 1));
    else if (view === 'day') setAnchor((a) => addDays(a, -1));
    else setAnchor((a) => addDays(a, -7));
  }
  function goNext() {
    if (view === 'month') setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + 1, 1));
    else if (view === 'day') setAnchor((a) => addDays(a, 1));
    else setAnchor((a) => addDays(a, 7));
  }
  function goMiniPrevMonth() {
    setAnchor((a) => new Date(a.getFullYear(), a.getMonth() - 1, 1));
  }
  function goMiniNextMonth() {
    setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + 1, 1));
  }

  // --- Formulaires Ajouter / Modifier (réutilisés par la vue Mois et la grille horaire) ---
  function openAdd() {
    if (!selectedYmd) return;
    setFormDate(selectedYmd);
    setForm({ ...emptyForm, route: routes[0]?.id || '' });
    setAddOpen(true);
  }
  function openAddAt(day: Date, hour: number) {
    setFormDate(ymd(day));
    setForm({ ...emptyForm, route: routes[0]?.id || '', time: `${String(hour).padStart(2, '0')}:00` });
    setAddOpen(true);
  }

  async function submitAdd() {
    if (!formDate || !form.route) return;
    setBusy(true);
    try {
      const scheduledStart = new Date(`${formDate}T${form.time}:00`).toISOString();
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
      refreshAll();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  function openEdit(it: PatrolOccurrence) {
    setFormDate(ymd(new Date(it.scheduledStart)));
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
    if (!editOpen || !formDate) return;
    setBusy(true);
    try {
      const scheduledStart = new Date(`${formDate}T${form.time}:00`).toISOString();
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
      refreshAll();
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
      refreshAll();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  // Glisser-déposer dans le panneau « jour » (vue Mois) : changer le shift d'un rondier.
  async function dropOnShift(occurrenceId: string, shiftId: string) {
    setDragOverShift('');
    try {
      await api(`/patrols/${occurrenceId}`, { method: 'PATCH', body: { shift: shiftId || null } });
      toast('Shift mis à jour');
      refreshAll();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  // Glisser-déposer dans la grille Jour/Semaine : déplacer un rondier vers un autre jour/heure.
  async function moveOccurrence(occurrenceId: string, day: Date, hour: number) {
    setDragOverCell('');
    try {
      const scheduledStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, 0, 0).toISOString();
      await api(`/patrols/${occurrenceId}`, { method: 'PATCH', body: { scheduledStart } });
      toast('Ronde déplacée');
      refreshAll();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Au changement de vue Jour/Semaine, centrer la grille sur 6h plutôt que minuit.
    if (view !== 'month' && scrollRef.current) scrollRef.current.scrollTop = 6 * HOUR_HEIGHT - 24;
  }, [view, visibleYmds.join('|')]);

  const viewTabs: { key: ViewMode; label: string }[] = [
    { key: 'day', label: 'Jour' },
    { key: 'workweek', label: 'Semaine de travail' },
    { key: 'week', label: 'Semaine' },
    { key: 'month', label: 'Mois' },
  ];

  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-steel">Calendrier de Configuration</p>

      {/* Barre d'outils façon Outlook */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel p-3">
        <div className="flex items-center gap-2">
          <Button onClick={() => openAddAt(anchor, 8)} disabled={!routes.length}>
            <Plus className="h-4 w-4" /> Ajouter un rondier
          </Button>
          <Button size="sm" variant="secondary" onClick={goToday}>
            Aujourd’hui
          </Button>
          <div className="flex items-center">
            <Button size="sm" variant="ghost" onClick={goPrev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={goNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <h2 className="text-sm font-semibold capitalize text-white">{rangeTitle(view, visibleDays, anchor)}</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-line">
            {viewTabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setView(t.key)}
                className={clsx('px-3 py-1.5 text-xs whitespace-nowrap', view === t.key ? 'bg-brand text-white' : 'bg-transparent text-steel hover:text-white')}
              >
                {t.label}
              </button>
            ))}
          </div>
          <Button size="sm" variant="ghost" onClick={() => window.print()} title="Imprimer">
            <Printer className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Mini calendrier (navigation rapide, comme la colonne de gauche d'Outlook) */}
        <div className="w-full shrink-0 rounded-xl border border-line bg-panel p-3 lg:w-64">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-white">
              {MONTHS[anchor.getMonth()]} {anchor.getFullYear()}
            </span>
            <div className="flex items-center gap-0.5">
              <Button size="sm" variant="ghost" onClick={goMiniPrevMonth}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" onClick={goMiniNextMonth}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-steel">
            {DOW.map((d, i) => (
              <div key={i} className="py-0.5">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {monthWeeks.flat().map((d, i) => {
              const inMonth = d.getMonth() === anchor.getMonth();
              const isToday = sameDay(d, today);
              const isAnchor = sameDay(d, anchor);
              const hasSchedule = activeDows.has(d.getDay());
              return (
                <button
                  key={i}
                  onClick={() => setAnchor(new Date(d.getFullYear(), d.getMonth(), d.getDate()))}
                  className={clsx(
                    'flex h-7 flex-col items-center justify-center rounded text-[11px]',
                    inMonth ? 'text-white' : 'text-zinc-700',
                    isAnchor && 'bg-brand text-white',
                    !isAnchor && isToday && 'text-brand font-semibold',
                    !isAnchor && 'hover:bg-white/5'
                  )}
                >
                  {d.getDate()}
                  {hasSchedule && inMonth && !isAnchor && <span className="h-1 w-1 rounded-full bg-brand" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Vue principale */}
        <div className="min-w-0 flex-1 rounded-xl border border-line bg-panel p-3">
          {view === 'month' ? (
            <div>
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-steel">
                {DOW_FULL.map((d, i) => (
                  <div key={i} className="py-1">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {monthWeeks.map((week, wi) =>
                  week.map((d, di) => {
                    const inMonth = d.getMonth() === anchor.getMonth();
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
          ) : (
            <div>
              {/* En-têtes des jours */}
              <div className="flex border-b border-line/60 pl-12">
                {visibleDays.map((d) => {
                  const isToday = sameDay(d, today);
                  return (
                    <button
                      key={ymd(d)}
                      onClick={() => setSelected(d)}
                      className="flex flex-1 flex-col items-center gap-0.5 border-l border-line/40 py-2 text-xs text-steel hover:bg-white/5"
                      title="Ouvrir le panneau du jour"
                    >
                      <span>{DOW_FULL[(d.getDay() + 6) % 7]}</span>
                      <span className={clsx('flex h-6 w-6 items-center justify-center rounded-full font-semibold', isToday ? 'bg-brand text-white' : 'text-white')}>
                        {d.getDate()}
                      </span>
                    </button>
                  );
                })}
              </div>

              {rangeError && <ErrorBox error={rangeError} />}

              {/* Grille horaire */}
              <div ref={scrollRef} className="relative max-h-[60vh] overflow-y-auto">
                {rangeLoading && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-panel/60">
                    <Loading />
                  </div>
                )}
                <div className="flex">
                  <div className="w-12 shrink-0">
                    {HOURS.map((h) => (
                      <div key={h} style={{ height: HOUR_HEIGHT }} className="border-t border-line/30 pr-1.5 text-right text-[10px] text-steel">
                        {String(h).padStart(2, '0')}:00
                      </div>
                    ))}
                  </div>
                  {visibleDays.map((d) => {
                    const dKey = ymd(d);
                    const dayItems = rangeItems[dKey] || [];
                    const laid = layoutDayEvents(dayItems);
                    const cellKeyPrefix = `${dKey}-`;
                    return (
                      <div key={dKey} className="relative flex-1 border-l border-line/40" style={{ height: 24 * HOUR_HEIGHT }}>
                        {HOURS.map((h) => {
                          const cellKey = `${cellKeyPrefix}${h}`;
                          return (
                            <div
                              key={h}
                              onClick={() => openAddAt(d, h)}
                              onDragOver={(e) => {
                                e.preventDefault();
                                setDragOverCell(cellKey);
                              }}
                              onDragLeave={() => setDragOverCell('')}
                              onDrop={(e) => {
                                e.preventDefault();
                                const id = e.dataTransfer.getData('text/plain');
                                if (id) moveOccurrence(id, d, h);
                              }}
                              style={{ position: 'absolute', top: h * HOUR_HEIGHT, left: 0, right: 0, height: HOUR_HEIGHT }}
                              className={clsx('cursor-pointer border-t border-line/20 hover:bg-white/[0.03]', dragOverCell === cellKey && 'bg-brand/10')}
                            />
                          );
                        })}
                        {laid.map(({ ev, col, totalCols }) => {
                          const start = new Date(ev.scheduledStart);
                          const startMin = start.getHours() * 60 + start.getMinutes();
                          const end = ev.dueBy ? new Date(ev.dueBy) : new Date(start.getTime() + 60 * 60000);
                          let endMin = end.getHours() * 60 + end.getMinutes();
                          if (sameDay(start, end) === false || endMin <= startMin) endMin = Math.min(startMin + 60, 24 * 60);
                          const top = (startMin / 60) * HOUR_HEIGHT;
                          const height = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 22);
                          const widthPct = 100 / totalCols;
                          const leftPct = col * widthPct;
                          const st = PATROL_STATUS[ev.status];
                          return (
                            <div
                              key={ev.id}
                              draggable
                              onDragStart={(e) => {
                                e.stopPropagation();
                                e.dataTransfer.setData('text/plain', ev.id);
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                openEdit(ev);
                              }}
                              style={{ position: 'absolute', top, height, left: `calc(${leftPct}% + 2px)`, width: `calc(${widthPct}% - 4px)` }}
                              className={clsx(
                                'cursor-pointer overflow-hidden rounded-md border px-1.5 py-1 text-left shadow-sm transition hover:brightness-110',
                                st?.tone === 'success' && 'border-emerald-800 bg-emerald-950/90',
                                st?.tone === 'warning' && 'border-amber-800 bg-amber-950/90',
                                st?.tone === 'danger' && 'border-red-800 bg-red-950/90',
                                st?.tone === 'info' && 'border-sky-800 bg-sky-950/90',
                                (!st || st.tone === 'neutral') && 'border-brand/50 bg-brand/20',
                                ev.virtual && 'border-dashed opacity-80'
                              )}
                              title={`${fmtTime(ev.scheduledStart)} · ${agentLabel(ev.agent) || 'Non affecté'}`}
                            >
                              <p className="truncate text-[10px] font-semibold text-white">
                                {fmtTime(ev.scheduledStart)} {agentLabel(ev.agent) || 'Non affecté'}
                              </p>
                              <p className="truncate text-[10px] text-steel-2">{typeof ev.route === 'string' ? ev.route : ev.route.name}</p>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="mt-2 text-[11px] text-steel">
                Cliquez sur une case vide pour ajouter un rondier à cette heure, sur une ronde pour la modifier, ou glissez-la vers un autre jour/heure.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Panneau détaillé du jour (vue Mois, ou clic sur l'en-tête d'un jour en vue Semaine/Jour) */}
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
