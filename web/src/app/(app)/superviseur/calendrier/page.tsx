'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, ClipboardList, ExternalLink, Phone } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { useSidebar } from '@/lib/sidebar';
import { fmtTime, PATROL_STATUS } from '@/lib/format';
import type { PatrolOccurrence, User } from '@/lib/types';
import { Badge, Button, Card, Empty, ErrorBox, Loading } from '@/components/ui';

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const NO_AGENT = '__none__';

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

/**
 * Calendrier du superviseur : petit calendrier à gauche, rondiers affectés à la date choisie à droite.
 * Le menu latéral se masque tant que la page est ouverte (bouton « Menu » en bas à gauche pour le rouvrir).
 */
export default function CalendrierPage() {
  const { setCollapsed } = useSidebar();
  useEffect(() => {
    setCollapsed(true);
    return () => setCollapsed(false);
  }, [setCollapsed]);

  const today = useMemo(() => new Date(), []);
  const [selected, setSelected] = useState<Date>(today);
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [agentKey, setAgentKey] = useState<string | null>(null);

  const { data, loading, error } = useApi<{ items: PatrolOccurrence[] }>('/patrols/day', { date: ymd(selected) });

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
  const cells = monthGrid(cursor.y, cursor.m);
  const monthLabel = new Date(cursor.y, cursor.m, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const dateLabel = selected.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  function shiftMonth(d: number) {
    setCursor((c) => {
      const n = new Date(c.y, c.m + d, 1);
      return { y: n.getFullYear(), m: n.getMonth() };
    });
  }

  const nameOf = (a: User | null) => (a ? `${a.firstName} ${a.lastName}` : 'Non affecté');

  return (
    <div className="grid min-h-[calc(100vh-3rem)] gap-6 lg:grid-cols-[300px_1fr]">
      {/* Gauche : petit calendrier */}
      <div className="space-y-4">
        <Card>
          <div className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <button type="button" onClick={() => shiftMonth(-1)} className="rounded p-1.5 text-steel hover:bg-white/5 hover:text-white" aria-label="Mois précédent">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <p className="text-sm font-semibold capitalize text-white">{monthLabel}</p>
              <button type="button" onClick={() => shiftMonth(1)} className="rounded p-1.5 text-steel hover:bg-white/5 hover:text-white" aria-label="Mois suivant">
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
            <Button
              size="sm"
              variant="ghost"
              className="mt-3 w-full"
              onClick={() => {
                setSelected(today);
                setCursor({ y: today.getFullYear(), m: today.getMonth() });
                setAgentKey(null);
              }}
            >
              Aujourd’hui
            </Button>
          </div>
        </Card>
        <Link
          href="/superviseur/planification"
          className="flex items-center justify-center gap-2 rounded-lg border border-line bg-panel px-4 py-2.5 text-sm text-white hover:border-brand/60"
        >
          <ClipboardList className="h-4 w-4 text-brand" /> Planifier un rondier
        </Link>
      </div>

      {/* Droite : rondiers du jour + détail */}
      <div className="min-w-0">
        <h1 className="mb-4 text-xl font-semibold capitalize text-white">{dateLabel}</h1>
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
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
