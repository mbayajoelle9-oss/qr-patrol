'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { CalendarDays, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { DAYS } from '@/lib/format';
import type { PatrolRoute, Ref, Schedule, User } from '@/lib/types';
import { Button, Card, Empty, ErrorBox, Field, Input, Loading, PageHeader, Select, useToast } from '@/components/ui';

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 0];
const siteIdOf = (s: Ref | string) => (typeof s === 'string' ? s : s.id);
const siteNameOf = (s: Ref | string) => (typeof s === 'string' ? '' : s.name || '');

/**
 * Planification : on associe un rondier à une ronde existante. L'heure de départ vient de la ronde
 * (modifiable). Une fois planifié, le calendrier s'ouvre.
 */
export default function PlanificationPage() {
  const toast = useToast();
  const router = useRouter();
  const { data: agents } = useApi<{ items: User[] }>('/users', { role: 'agent', active: true });
  const { data: routes } = useApi<{ items: PatrolRoute[] }>('/routes', { active: true });
  const { data: schedules, loading, error, reload } = useApi<{ items: Schedule[] }>('/schedules');
  const [agent, setAgent] = useState('');
  const [route, setRoute] = useState('');
  const [startTime, setStartTime] = useState('');
  const [days, setDays] = useState<number[]>(ALL_DAYS);
  const [busy, setBusy] = useState(false);

  const selectedAgent = agents?.items.find((a) => a.id === agent);
  // Si le rondier est rattaché à des sites, on ne lui propose que les rondes de ces sites
  const availableRoutes = useMemo(() => {
    const list = routes?.items || [];
    const sites = selectedAgent?.sites?.map((s) => s.id) || [];
    return sites.length ? list.filter((r) => sites.includes(siteIdOf(r.site))) : list;
  }, [routes, selectedAgent]);

  function pickRoute(id: string) {
    setRoute(id);
    const r = routes?.items.find((x) => x.id === id);
    setStartTime(r?.startTime || '');
  }

  async function save() {
    if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(startTime)) {
      toast('Indiquez l’heure de départ', 'error');
      return;
    }
    setBusy(true);
    try {
      await api('/schedules', {
        body: { route, assignedAgent: agent, startTimes: [startTime], daysOfWeek: days, windowMinutes: 60 },
      });
      toast('Rondier planifié');
      router.push('/superviseur/calendrier');
    } catch (e) {
      toast((e as Error).message, 'error');
      setBusy(false);
    }
  }

  async function remove(s: Schedule) {
    if (!confirm('Retirer cette planification ?')) return;
    try {
      await api(`/schedules/${s.id}`, { method: 'DELETE' });
      toast('Planification retirée');
      reload(true);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  const active = (schedules?.items || []).filter((s) => s.active);

  return (
    <>
      <PageHeader title="Planification" subtitle="Associez un rondier à une ronde. C’est tout : il la verra sur son téléphone." />

      <Card title="Nouvelle planification">
        <div className="grid gap-4 p-4 md:grid-cols-2">
          <Field label="1. Rondier *">
            <Select
              value={agent}
              onChange={(e) => {
                setAgent(e.target.value);
                setRoute('');
                setStartTime('');
              }}
            >
              <option value="">— Choisir un rondier —</option>
              {agents?.items.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.firstName} {a.lastName} {a.matricule ? `(${a.matricule})` : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="2. Ronde *">
            <Select value={route} onChange={(e) => pickRoute(e.target.value)} disabled={!agent}>
              <option value="">— Choisir une ronde —</option>
              {availableRoutes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · {siteNameOf(r.site)}
                  {r.startTime ? ` · ${r.startTime}` : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="3. Heure de départ" hint="Reprise de la ronde, vous pouvez la changer">
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} disabled={!route} />
          </Field>
          <div>
            <p className="mb-2 text-xs font-medium text-steel-2">4. Jours</p>
            <div className="flex flex-wrap gap-1.5">
              {ALL_DAYS.map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setDays((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i]))}
                  className={clsx('rounded-md px-3 py-1.5 text-xs', days.includes(i) ? 'bg-brand text-white' : 'bg-zinc-800 text-steel')}
                >
                  {DAYS[i]}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end border-t border-line px-4 py-3">
          <Button loading={busy} disabled={!agent || !route || !startTime || !days.length} onClick={save}>
            <CalendarDays className="h-4 w-4" /> Planifier et voir le calendrier
          </Button>
        </div>
      </Card>

      <div className="mt-6">
        <Card title="Planifications en cours">
          <ErrorBox error={error} />
          {loading && !schedules ? (
            <Loading />
          ) : !active.length ? (
            <Empty>Aucune planification pour le moment.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {active.map((s) => (
                <li key={s.id} className="flex items-center gap-4 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-white">
                      {s.assignedAgent ? `${s.assignedAgent.firstName} ${s.assignedAgent.lastName}` : 'Non affecté'}
                    </p>
                    <p className="text-xs text-steel">
                      {s.route?.name} · {s.site?.name}
                    </p>
                  </div>
                  <div className="text-right text-xs text-steel-2">
                    <p className="font-mono text-white">{s.startTimes.join(' · ') || '—'}</p>
                    <p>{s.daysOfWeek.length === 7 ? 'Tous les jours' : [...s.daysOfWeek].sort().map((d) => DAYS[d]).join(' ')}</p>
                  </div>
                  <Button size="sm" variant="ghost" title="Retirer" onClick={() => remove(s)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
