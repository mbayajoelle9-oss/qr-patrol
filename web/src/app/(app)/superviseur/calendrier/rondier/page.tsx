'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, ClipboardList } from 'lucide-react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useSidebar } from '@/lib/sidebar';
import { fmtTime, PATROL_STATUS } from '@/lib/format';
import { visibleOccurrences } from '@/lib/occurrences';
import type { PatrolOccurrence, Schedule, User } from '@/lib/types';
import { Badge, Button, Card, Empty, ErrorBox, Loading } from '@/components/ui';

type View = 'day' | 'week' | 'month' | 'semester';

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const NO_AGENT = '__none__';

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const sameDay = (a: Date, b: Date) => ymd(a) === ymd(b);

function monthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // semaine commençant le lundi
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < offset; i += 1) cells.push(null);
  for (let d = 1; d <= days; d += 1) cells.push(new Date(year, month, d));
  while (cells.length % 7) cells.push(null);
  return cells;
}

interface AgentGroup {
  key: string;
  agent: User | null;
  items: PatrolOccurrence[];
}

/** Charge de la journée d'après les plannings actifs (sert aux vues mois et semestre). */
function loadOf(schedules: Schedule[], d: Date) {
  const noon = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime();
  const dow = d.getDay();
  const agents = new Set<string>();
  let rondes = 0;
  for (const s of schedules) {
    if (!s.active || !s.daysOfWeek.includes(dow)) continue;
    if (s.validFrom && new Date(s.validFrom).getTime() > noon) continue;
    if (s.validUntil && new Date(s.validUntil).getTime() < noon) continue;
    rondes += Math.max(s.startTimes.length, 1);
    if (s.assignedAgent) agents.add(s.assignedAgent.id);
    else s.agents.forEach((a) => agents.add(a.id));
  }
  return { agents: agents.size, rondes };
}

/**
 * Calendrier du superviseur : vues Jour, Mois et Semestre. En vue Jour : petit calendrier à gauche, rondiers
 * affectés à la date choisie à droite, avec la possibilité d'affecter un rondier à une autre ronde.
 * Le menu latéral se masque tant que la page est ouverte (bouton « Menu » en bas à gauche pour le rouvrir).
 */
export default function CalendrierPage() {
  const { setCollapsed } = useSidebar();
  useEffect(() => {
    setCollapsed(true);
    return () => setCollapsed(false);
  }, [setCollapsed]);

  const today = useMemo(() => new Date(), []);
  const [view, setView] = useState<View>('day');
  const [selected, setSelected] = useState<Date>(today);
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const router = useRouter();

  const { data, loading, error } = useApi<{ items: PatrolOccurrence[] }>(view === 'day' ? '/patrols/day' : null, { date: ymd(selected) });
  const { data: sched } = useApi<{ items: Schedule[] }>('/schedules');
  const schedules = sched?.items || [];
  const schedulesOrNull = sched ? sched.items : null;

  // Vue semaine : une colonne par jour (lundi → dimanche)
  const weekDays = useMemo(() => {
    const mon = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate() - ((selected.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i));
  }, [selected]);
  const [weekData, setWeekData] = useState<Record<string, PatrolOccurrence[]>>({});
  const [weekLoading, setWeekLoading] = useState(false);
  const weekKey = view === 'week' ? ymd(weekDays[0]) : '';
  useEffect(() => {
    if (view !== 'week') return undefined;
    let cancelled = false;
    setWeekLoading(true);
    Promise.all(weekDays.map((d) => api<{ items: PatrolOccurrence[] }>('/patrols/day', { query: { date: ymd(d) } }).then((r) => [ymd(d), r.items] as const)))
      .then((rows) => {
        if (!cancelled) setWeekData(Object.fromEntries(rows));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setWeekLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, weekKey]);

  const groups = useMemo<AgentGroup[]>(() => {
    const map = new Map<string, AgentGroup>();
    for (const it of visibleOccurrences(data?.items || [], schedulesOrNull)) {
      const key = it.agent?.id || NO_AGENT;
      if (!map.has(key)) map.set(key, { key, agent: it.agent || null, items: [] });
      map.get(key)!.items.push(it);
    }
    const list = [...map.values()];
    list.forEach((g) => g.items.sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart)));
    list.sort((a, b) => (a.key === NO_AGENT ? 1 : b.key === NO_AGENT ? -1 : (a.agent?.lastName || '').localeCompare(b.agent?.lastName || '')));
    return list;
  }, [data, schedulesOrNull]);

  const nameOf = (a: User | null) => (a ? `${a.firstName} ${a.lastName}` : 'Non affecté');

  function goDay(d: Date) {
    setSelected(d);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
    setView('day');
  }
  function openAgent(key: string, d: Date) {
    router.push(`/superviseur/calendrier/rondier?agent=${encodeURIComponent(key)}&date=${ymd(d)}`);
  }
  function moveWeek(n: number) {
    const d = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate() + 7 * n);
    setSelected(d);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
  }
  function shift(months: number) {
    setCursor((c) => {
      const n = new Date(c.y, c.m + months, 1);
      return { y: n.getFullYear(), m: n.getMonth() };
    });
  }

  const semStart = cursor.m < 6 ? 0 : 6;
  const dateLabel = selected.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const monthLabel = (y: number, m: number) => new Date(y, m, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  const viewButtons: { id: View; label: string }[] = [
    { id: 'day', label: 'Jour' },
    { id: 'week', label: 'Semaine' },
    { id: 'month', label: 'Mois' },
    { id: 'semester', label: 'Semestre' },
  ];

  const toolbar = (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="flex rounded-lg border border-line bg-panel p-0.5">
        {viewButtons.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => setView(b.id)}
            className={clsx('rounded-md px-4 py-1.5 text-sm transition', view === b.id ? 'bg-brand font-medium text-white' : 'text-steel hover:text-white')}
          >
            {b.label}
          </button>
        ))}
      </div>
      {view !== 'day' && (
        <>
          <button type="button" onClick={() => (view === 'week' ? moveWeek(-1) : shift(view === 'month' ? -1 : -6))} className="rounded p-1.5 text-steel hover:bg-white/5 hover:text-white" aria-label="Précédent">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="min-w-[200px] text-center text-lg font-semibold capitalize text-white">
            {view === 'week'
              ? `${weekDays[0].toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} – ${weekDays[6].toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`
              : view === 'month' ? monthLabel(cursor.y, cursor.m) : `${semStart === 0 ? '1er' : '2e'} semestre ${cursor.y}`}
          </h1>
          <button type="button" onClick={() => (view === 'week' ? moveWeek(1) : shift(view === 'month' ? 1 : 6))} className="rounded p-1.5 text-steel hover:bg-white/5 hover:text-white" aria-label="Suivant">
            <ChevronRight className="h-5 w-5" />
          </button>
          <Button size="sm" variant="ghost" onClick={() => { setCursor({ y: today.getFullYear(), m: today.getMonth() }); setSelected(today); }}>
            Aujourd’hui
          </Button>
        </>
      )}
      <Link href="/superviseur/planification" className="ml-auto flex items-center gap-2 rounded-lg border border-line bg-panel px-4 py-2 text-sm text-white hover:border-brand/60">
        <ClipboardList className="h-4 w-4 text-brand" /> Planifier
      </Link>
    </div>
  );

  // ------------------------------------------------------------------ Vue semaine
  if (view === 'week') {
    return (
      <div>
        {toolbar}
        {weekLoading && !Object.keys(weekData).length ? (
          <Loading />
        ) : (
          <div className="grid gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-7">
            {weekDays.map((d) => {
              const items = visibleOccurrences(weekData[ymd(d)] || [], schedulesOrNull).sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
              return (
                <div key={ymd(d)} className={clsx('min-h-[280px] bg-panel', sameDay(d, today) && 'bg-brand/5')}>
                  <button type="button" onClick={() => goDay(d)} className="w-full border-b border-line px-3 py-2 text-left hover:bg-white/5">
                    <p className="text-[11px] uppercase text-steel">{d.toLocaleDateString('fr-FR', { weekday: 'short' })}</p>
                    <p className={clsx('text-lg font-semibold', sameDay(d, today) ? 'text-brand' : 'text-white')}>{d.getDate()}</p>
                  </button>
                  <div className="space-y-1.5 p-2">
                    {!items.length && <p className="px-1 text-xs text-steel">—</p>}
                    {items.map((it) => {
                      const st = PATROL_STATUS[it.status];
                      return (
                        <button
                          key={it.id}
                          type="button"
                          onClick={() => {
                            openAgent(it.agent?.id || NO_AGENT, d);
                          }}
                          className="w-full rounded-md border border-line bg-ink p-2 text-left transition hover:border-brand/60"
                        >
                          <p className="font-mono text-xs text-white">{fmtTime(it.scheduledStart)}</p>
                          <p className="truncate text-xs text-steel-2">{it.agent ? `${it.agent.firstName} ${it.agent.lastName}` : 'Non affecté'}</p>
                          <p className="truncate text-[11px] text-steel">{it.route?.name}</p>
                          <Badge tone={st?.tone}>{st?.label || it.status}</Badge>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-2 text-xs text-steel">Cliquez sur un jour, ou sur une ronde pour ouvrir la fiche du rondier.</p>
      </div>
    );
  }

  // ------------------------------------------------------------------ Vue mois
  if (view === 'month') {
    const cells = monthGrid(cursor.y, cursor.m);
    return (
      <div>
        {toolbar}
        <Card>
          <div className="grid grid-cols-7 border-b border-line text-center text-xs text-steel">
            {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((w) => (
              <span key={w} className="py-2">
                {w}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((d, i) => {
              if (!d) return <div key={i} className="min-h-[96px] border-b border-r border-line bg-black/20" />;
              const l = loadOf(schedules, d);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => goDay(d)}
                  className={clsx(
                    'min-h-[96px] border-b border-r border-line p-2 text-left transition hover:bg-white/5',
                    sameDay(d, today) && 'bg-brand/10'
                  )}
                >
                  <span className={clsx('text-sm', sameDay(d, today) ? 'font-bold text-brand' : 'text-steel-2')}>{d.getDate()}</span>
                  {l.rondes > 0 && (
                    <div className="mt-2 space-y-1 text-[11px]">
                      <p className="rounded bg-brand/20 px-1.5 py-0.5 text-white">{l.agents} rondier(s)</p>
                      <p className="text-steel">{l.rondes} ronde(s)</p>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </Card>
        <p className="mt-2 text-xs text-steel">Cliquez sur un jour pour voir le détail des rondiers affectés.</p>
      </div>
    );
  }

  // ------------------------------------------------------------------ Vue semestre
  if (view === 'semester') {
    return (
      <div>
        {toolbar}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, k) => semStart + k).map((m) => {
            const cells = monthGrid(cursor.y, m);
            return (
              <Card key={m}>
                <button type="button" onClick={() => { setCursor({ y: cursor.y, m }); setView('month'); }} className="w-full border-b border-line px-4 py-2 text-left text-sm font-semibold capitalize text-white hover:text-brand">
                  {monthLabel(cursor.y, m)}
                </button>
                <div className="grid grid-cols-7 gap-1 p-3 text-center text-[11px] text-steel">
                  {WEEKDAYS.map((w, i) => (
                    <span key={i}>{w}</span>
                  ))}
                  {cells.map((d, i) => {
                    if (!d) return <span key={i} />;
                    const l = loadOf(schedules, d);
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => goDay(d)}
                        title={l.rondes ? `${l.agents} rondier(s) · ${l.rondes} ronde(s)` : undefined}
                        className={clsx(
                          'aspect-square rounded text-xs transition hover:ring-1 hover:ring-brand',
                          l.rondes === 0 && 'text-steel hover:bg-white/5',
                          l.rondes > 0 && l.rondes < 3 && 'bg-brand/25 text-white',
                          l.rondes >= 3 && 'bg-brand/60 font-semibold text-white',
                          sameDay(d, today) && 'ring-1 ring-white/70'
                        )}
                      >
                        {d.getDate()}
                      </button>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-steel">Plus la case est rouge, plus il y a de rondes ce jour-là. Cliquez sur un jour pour le détail.</p>
      </div>
    );
  }

  // ------------------------------------------------------------------ Vue jour
  const cells = monthGrid(cursor.y, cursor.m);
  return (
    <div>
      {toolbar}
      <div className="grid min-h-[calc(100vh-9rem)] gap-6 lg:grid-cols-[300px_1fr]">
        {/* Gauche : petit calendrier */}
        <div>
          <Card>
            <div className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <button type="button" onClick={() => shift(-1)} className="rounded p-1.5 text-steel hover:bg-white/5 hover:text-white" aria-label="Mois précédent">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <p className="text-sm font-semibold capitalize text-white">{monthLabel(cursor.y, cursor.m)}</p>
                <button type="button" onClick={() => shift(1)} className="rounded p-1.5 text-steel hover:bg-white/5 hover:text-white" aria-label="Mois suivant">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-steel">
                {WEEKDAYS.map((w, i) => (
                  <span key={i} className="py-1">
                    {w}
                  </span>
                ))}
                {cells.map((d, i) =>
                  d ? (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSelected(d)}
                      className={clsx(
                        'aspect-square rounded-lg text-sm transition',
                        sameDay(d, selected) ? 'bg-brand font-semibold text-white' : sameDay(d, today) ? 'text-brand ring-1 ring-brand/50' : 'text-steel-2 hover:bg-white/5'
                      )}
                    >
                      {d.getDate()}
                    </button>
                  ) : (
                    <span key={i} />
                  )
                )}
              </div>
              <Button size="sm" variant="ghost" className="mt-3 w-full" onClick={() => goDay(today)}>
                Aujourd’hui
              </Button>
            </div>
          </Card>
        </div>

        {/* Droite : rondiers du jour ; un clic ouvre la fiche du rondier sur un écran à part */}
        <div className="min-w-0">
          <h2 className="mb-4 text-xl font-semibold capitalize text-white">{dateLabel}</h2>
          <ErrorBox error={error} />
          <Card title={`Rondiers affectés (${groups.length})`}>
            {loading && !data ? (
              <Loading />
            ) : !groups.length ? (
              <Empty>Aucun rondier affecté ce jour-là.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {groups.map((g) => (
                  <li key={g.key}>
                    <button type="button" onClick={() => openAgent(g.key, selected)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/5">
                      {g.agent?.photo?.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={g.agent.photo.url} alt="" className="h-10 w-10 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand/15 text-xs font-bold text-brand">
                          {g.agent ? `${g.agent.firstName[0]}${g.agent.lastName[0]}` : '?'}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-white">{nameOf(g.agent)}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {g.items.slice(0, 3).map((it) => {
                            const st = PATROL_STATUS[it.status];
                            return (
                              <Badge key={it.id} tone={st?.tone}>
                                <span className="font-mono">{fmtTime(it.scheduledStart)}</span> · {it.route?.name}
                              </Badge>
                            );
                          })}
                          {g.items.length > 3 && <span className="text-[11px] text-steel">+{g.items.length - 3} autre(s)</span>}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-steel" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <p className="mt-2 text-xs text-steel">Cliquez sur un rondier pour ouvrir sa fiche.</p>
        </div>
      </div>
    </div>
  );
}
