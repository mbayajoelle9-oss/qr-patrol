'use client';

import { Suspense, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, Phone } from 'lucide-react';
import { useApi } from '@/lib/useApi';
import { fmtTime, PATROL_STATUS } from '@/lib/format';
import { visibleOccurrences } from '@/lib/occurrences';
import type { PatrolOccurrence, PatrolRoute, Schedule, User } from '@/lib/types';
import { AssignBox } from '@/components/AssignBox';
import { Badge, Button, Card, Empty, ErrorBox, Loading } from '@/components/ui';

const NO_AGENT = '__none__';
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Fiche d'un rondier pour une date : ses rondes, leur état, et l'affectation à une autre ronde. */
function Fiche() {
  const router = useRouter();
  const params = useSearchParams();
  const agentKey = params.get('agent') || '';
  const dateParam = params.get('date') || '';
  const date = useMemo(() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateParam);
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date();
  }, [dateParam]);

  const { data, loading, error, reload } = useApi<{ items: PatrolOccurrence[] }>('/patrols/day', { date: ymd(date) });
  const { data: sched, reload: reloadSched } = useApi<{ items: Schedule[] }>('/schedules');
  const { data: routes } = useApi<{ items: PatrolRoute[] }>('/routes', { active: true });
  const { data: agents } = useApi<{ items: User[] }>('/users', { role: 'agent' });

  const items = useMemo(
    () =>
      visibleOccurrences(data?.items || [], sched ? sched.items : null)
        .filter((it) => (it.agent?.id || NO_AGENT) === agentKey)
        .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart)),
    [data, sched, agentKey]
  );
  const agent = agents?.items.find((a) => a.id === agentKey) || items.find((i) => i.agent)?.agent || null;
  const unassigned = agentKey === NO_AGENT;
  const dateLabel = date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  function goDate(n: number) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
    router.replace(`/superviseur/calendrier/rondier?agent=${encodeURIComponent(agentKey)}&date=${ymd(d)}`);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/superviseur/calendrier" className="mb-4 inline-flex items-center gap-2 text-sm text-steel hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Retour au calendrier
      </Link>

      <div className="mb-5 flex items-center gap-4">
        {agent?.photo?.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={agent.photo.url} alt="" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand/15 text-lg font-bold text-brand">
            {agent ? `${agent.firstName[0]}${agent.lastName[0]}` : '?'}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold text-white">{agent ? `${agent.firstName} ${agent.lastName}` : unassigned ? 'Rondes non affectées' : 'Rondier'}</h1>
          {agent && (
            <p className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-steel-2">
              {agent.matricule && (
                <span>
                  Matricule <span className="font-mono text-white">{agent.matricule}</span>
                </span>
              )}
              {agent.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" /> {agent.phone}
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => goDate(-1)} aria-label="Jour précédent">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <p className="min-w-[220px] text-center text-sm font-medium capitalize text-white">{dateLabel}</p>
        <Button size="sm" variant="ghost" onClick={() => goDate(1)} aria-label="Jour suivant">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <ErrorBox error={error} />
      <Card title={`Rondes du jour (${items.length})`}>
        {loading && !data ? (
          <Loading />
        ) : !items.length ? (
          <Empty>Aucune ronde pour ce rondier ce jour-là.</Empty>
        ) : (
          <ul className="space-y-3 p-4">
            {items.map((it) => {
              const st = PATROL_STATUS[it.status];
              return (
                <li key={it.id} className="rounded-lg border border-line bg-ink p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-2xl text-white">{fmtTime(it.scheduledStart)}</p>
                      <p className="mt-1 text-sm text-steel-2">{it.route?.name}</p>
                      <p className="text-xs text-steel">{it.site?.name}</p>
                    </div>
                    <Badge tone={st?.tone}>{st?.label || it.status}</Badge>
                  </div>
                  <p className="mt-3 text-sm text-steel-2">
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
        )}
      </Card>

      {unassigned ? (
        <p className="mt-4 text-sm text-steel">Ces rondes n’ont pas de rondier. Affectez-les depuis la page « Planification ».</p>
      ) : (
        agent && (
          <div className="mt-4">
            <AssignBox
              agent={agent}
              date={date}
              routes={routes?.items || []}
              already={new Set(items.map((i) => i.route?.id))}
              onDone={() => {
                reload(true);
                reloadSched(true);
              }}
            />
          </div>
        )
      )}
    </div>
  );
}

export default function RondierFichePage() {
  return (
    <Suspense fallback={<Loading />}>
      <Fiche />
    </Suspense>
  );
}
