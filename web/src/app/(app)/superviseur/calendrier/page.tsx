'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, ClipboardList, ExternalLink, Phone } from 'lucide-react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useSidebar } from '@/lib/sidebar';
import { fmtTime, PATROL_STATUS } from '@/lib/format';
import type { PatrolOccurrence, PatrolRoute, Ref, Schedule, User } from '@/lib/types';
import { Badge, Button, Card, Checkbox, Empty, ErrorBox, Input, Loading, useToast } from '@/components/ui';

type View = 'day' | 'month' | 'semester';

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const NO_AGENT = '__none__';

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const sameDay = (a: Date, b: Date) => ymd(a) === ymd(b);
const siteNameOf = (s: Ref | string) => (typeof s === 'string' ? '' : s.name || '');

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
  const [agentKey, setAgentKey] = useState<string | null>(null);

  const { data, loading, error, reload } = useApi<{ items: PatrolOccurrence[] }>(view === 'day' ? '/patrols/day' : null, { date: ymd(selected) });
  const { data: sched, reload: reloadSched } = useApi<{ items: Schedule[] }>('/schedules');
  const { data: routes } = useApi<{ items: PatrolRoute[] }>('/routes', { active: true });
  const schedules = sched?.items || [];

  const groups = useMemo<AgentGroup[]>(() => {
    const map = new Map<string, AgentGroup>();
    for (const it of data?.items || []) {
      const key = it.agent?.id || NO_AGENT;
      if (!map.has(key)) map.set(key, { key, agent: it.agent || null, items: [] });
      map.get(key)!.items.push(it);
    }
    const list = [...map.values()];
    list.forEach((g) => g.items.sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart)));
    list.sort((a, b) => (a.key === NO_AGENT ? 1 : b.key === NO_AGENT ? -1 : (a.agent?.lastName || '').localeCompare(b.agent?.lastName || '')));
    return list;
  }, [data]);

  const current = groups.find((g) => g.key === agentKey) || null;
  const nameOf = (a: User | null) => (a ? `${a.firstName} ${a.lastName}` : 'Non affecté');

  function goDay(d: Date) {
    setSelected(d);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
    setAgentKey(null);
    setView('day');
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
          <button type="button" onClick={() => shift(view === 'month' ? -1 : -6)} className="rounded p-1.5 text-steel hover:bg-white/5 hover:text-white" aria-label="Précédent">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="min-w-[200px] text-center text-lg font-semibold capitalize text-white">
            {view === 'month' ? monthLabel(cursor.y, cursor.m) : `${semStart === 0 ? '1er' : '2e'} semestre ${cursor.y}`}
          </h1>
          <button type="button" onClick={() => shift(view === 'month' ? 1 : 6)} className="rounded p-1.5 text-steel hover:bg-white/5 hover:text-white" aria-label="Suivant">
            <ChevronRight className="h-5 w-5" />
          </button>
          <Button size="sm" variant="ghost" onClick={() => setCursor({ y: today.getFullYear(), m: today.getMonth() })}>
            Aujourd’hui
          </Button>
        </>
      )}
      <Link href="/superviseur/planification" className="ml-auto flex items-center gap-2 rounded-lg border border-line bg-panel px-4 py-2 text-sm text-white hover:border-brand/60">
        <ClipboardList className="h-4 w-4 text-brand" /> Planifier
      </Link>
    </div>
  );

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
                      onClick={() => {
                        setSelected(d);
                        setAgentKey(null);
                      }}
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

        {/* Droite : rondiers du jour + détail */}
        <div className="min-w-0">
          <h2 className="mb-4 text-xl font-semibold capitalize text-white">{dateLabel}</h2>
          <ErrorBox error={error} />
          <div className={clsx('grid gap-4', current && 'xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]')}>
            <Card title={`Rondiers affectés (${groups.length})`}>
              {loading && !data ? (
                <Loading />
              ) : !groups.length ? (
                <Empty>Aucun rondier affecté ce jour-là.</Empty>
              ) : (
                <ul className="divide-y divide-line">
                  {groups.map((g) => (
                    <li key={g.key}>
                      <button
                        type="button"
                        onClick={() => setAgentKey(g.key === agentKey ? null : g.key)}
                        className={clsx('flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/5', g.key === agentKey && 'bg-brand/10')}
                      >
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
                          <p className="text-xs text-steel">{g.items.length} ronde(s)</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-steel" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {current && (
              <Card title={nameOf(current.agent)}>
                <div className="space-y-4 p-4">
                  {current.agent && (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-steel-2">
                      {current.agent.matricule && (
                        <span>
                          Matricule <span className="font-mono text-white">{current.agent.matricule}</span>
                        </span>
                      )}
                      {current.agent.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3.5 w-3.5" /> {current.agent.phone}
                        </span>
                      )}
                    </div>
                  )}
                  <ul className="space-y-3">
                    {current.items.map((it) => {
                      const st = PATROL_STATUS[it.status];
                      return (
                        <li key={it.id} className="rounded-lg border border-line bg-ink p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-mono text-lg text-white">{fmtTime(it.scheduledStart)}</p>
                              <p className="text-sm text-steel-2">{it.route?.name}</p>
                              <p className="text-xs text-steel">{it.site?.name}</p>
                            </div>
                            <Badge tone={st?.tone}>{st?.label || it.status}</Badge>
                          </div>
                          <p className="mt-2 text-xs text-steel">
                            Points : {it.stats.done}/{it.stats.total}
                            {it.stats.missed > 0 && ` · ${it.stats.missed} manqué(s)`}
                            {it.stats.suspicious > 0 && ` · ${it.stats.suspicious} à vérifier`}
                          </p>
                          {!it.virtual && (
                            <Link href={`/rondes/${it.id}`} className="mt-2 inline-flex items-center gap-1 text-xs text-brand hover:underline">
                              Voir le détail de la ronde <ExternalLink className="h-3 w-3" />
                            </Link>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {current.agent && (
                    <AssignBox
                      agent={current.agent}
                      date={selected}
                      routes={routes?.items || []}
                      already={new Set(current.items.map((i) => i.route?.id))}
                      onDone={() => {
                        reload(true);
                        reloadSched(true);
                      }}
                    />
                  )}
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Affecte le rondier à d'autres rondes existantes : on coche, c'est tout (l'heure vient de la ronde). */
function AssignBox({ agent, date, routes, already, onDone }: { agent: User; date: Date; routes: PatrolRoute[]; already: Set<string | undefined>; onDone: () => void }) {
  const toast = useToast();
  const [picked, setPicked] = useState<string[]>([]);
  const [times, setTimes] = useState<Record<string, string>>({});
  const [weekly, setWeekly] = useState(false);
  const [busy, setBusy] = useState(false);
  const day = ymd(date);
  const options = routes.filter((r) => !already.has(r.id));

  async function assign() {
    setBusy(true);
    try {
      for (const rid of picked) {
        const r = routes.find((x) => x.id === rid);
        const t = times[rid] || r?.startTime;
        if (!r || !t) continue;
        // eslint-disable-next-line no-await-in-loop
        await api('/schedules', {
          body: {
            route: rid,
            assignedAgent: agent.id,
            startTimes: [t],
            daysOfWeek: [date.getDay()],
            windowMinutes: 60,
            ...(weekly ? {} : { validFrom: `${day}T00:00:00+01:00`, validUntil: `${day}T23:59:59+01:00` }),
          },
        });
      }
      toast(`${agent.firstName} affecté(e)`);
      setPicked([]);
      onDone();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-line p-3">
      <p className="mb-2 text-xs font-medium text-steel-2">Affecter {agent.firstName} à une autre ronde</p>
      {!options.length ? (
        <p className="text-xs text-steel">Aucune autre ronde disponible.</p>
      ) : (
        <div className="space-y-1.5">
          {options.map((r) => (
            <div key={r.id} className="flex items-center gap-2">
              <div className="flex-1">
                <Checkbox
                  label={`${r.name} · ${siteNameOf(r.site)}`}
                  checked={picked.includes(r.id)}
                  onChange={(e) => {
                    setPicked((l) => (e.target.checked ? [...l, r.id] : l.filter((x) => x !== r.id)));
                    if (e.target.checked) setTimes((t) => ({ ...t, [r.id]: t[r.id] || r.startTime || '' }));
                  }}
                />
              </div>
              {picked.includes(r.id) && (
                <Input type="time" value={times[r.id] || ''} onChange={(e) => setTimes((t) => ({ ...t, [r.id]: e.target.value }))} className="!w-28 !py-1" />
              )}
            </div>
          ))}
          <div className="flex items-center justify-between gap-2 pt-2">
            <Checkbox label="Répéter chaque semaine ce jour-là" checked={weekly} onChange={(e) => setWeekly(e.target.checked)} />
            <Button size="sm" loading={busy} disabled={!picked.length || picked.some((id) => !times[id])} onClick={assign}>
              Affecter
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
