'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { CalendarDays, Clock, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { DAYS, fmtDate } from '@/lib/format';
import type { PatrolRoute, Ref, Schedule, User } from '@/lib/types';
import { Button, Card, Checkbox, Empty, ErrorBox, Field, Input, Loading, PageHeader, Select, useToast } from '@/components/ui';

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 0];
const siteIdOf = (s: Ref | string) => (typeof s === 'string' ? s : s.id);
const siteNameOf = (s: Ref | string) => (typeof s === 'string' ? '' : s.name || '');
const pad = (n: number) => String(n).padStart(2, '0');

type Period = 'always' | 'month' | 'range';

/**
 * Planification : on coche un ou plusieurs rondiers et une ou plusieurs rondes. L'heure de départ de chaque
 * ronde est reprise automatiquement (elle a été définie dans Master Ronde) : rien à saisir.
 */
export default function PlanificationPage() {
  const toast = useToast();
  const router = useRouter();
  const now = new Date();
  const { data: agents } = useApi<{ items: User[] }>('/users', { role: 'agent', active: true });
  const { data: routes } = useApi<{ items: PatrolRoute[] }>('/routes', { active: true });
  const { data: schedules, loading, error, reload } = useApi<{ items: Schedule[] }>('/schedules');
  const [picked, setPicked] = useState<string[]>([]);
  const [pickedRoutes, setPickedRoutes] = useState<string[]>([]);
  const [days, setDays] = useState<number[]>(ALL_DAYS);
  const [period, setPeriod] = useState<Period>('always');
  const [month, setMonth] = useState(`${now.getFullYear()}-${pad(now.getMonth() + 1)}`);
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const [busy, setBusy] = useState(false);

  const selectedAgents = useMemo(() => (agents?.items || []).filter((a) => picked.includes(a.id)), [agents, picked]);

  // Heure de départ d'une ronde : celle de la ronde ; à défaut, celle d'un planning existant sur cette ronde
  const startOf = (r: PatrolRoute) => r.startTime || schedules?.items.find((s) => s.route?.id === r.id && s.startTimes.length)?.startTimes[0] || '';

  // Si les rondiers choisis sont rattachés à des sites, on ne propose que les rondes de ces sites
  const availableRoutes = useMemo(() => {
    const list = routes?.items || [];
    const lists = selectedAgents.map((a) => (a.sites || []).map((s) => s.id)).filter((l) => l.length);
    return lists.length ? list.filter((r) => lists.every((l) => l.includes(siteIdOf(r.site)))) : list;
  }, [routes, selectedAgents]);

  function toggleAgent(id: string, on: boolean) {
    setPicked((l) => (on ? [...l, id] : l.filter((x) => x !== id)));
    setPickedRoutes([]);
  }

  function periodBounds(): { validFrom: string | null; validUntil: string | null } | string {
    if (period === 'always') return { validFrom: null, validUntil: null };
    if (period === 'month') {
      const [y, m] = month.split('-').map(Number);
      if (!y || !m) return 'Choisissez le mois';
      const last = new Date(y, m, 0).getDate();
      return { validFrom: `${y}-${pad(m)}-01T00:00:00+01:00`, validUntil: `${y}-${pad(m)}-${pad(last)}T23:59:59+01:00` };
    }
    if (!from || !until) return 'Indiquez les dates de début et de fin';
    if (until < from) return 'La date de fin est avant la date de début';
    return { validFrom: `${from}T00:00:00+01:00`, validUntil: `${until}T23:59:59+01:00` };
  }

  async function save() {
    const bounds = periodBounds();
    if (typeof bounds === 'string') {
      toast(bounds, 'error');
      return;
    }
    setBusy(true);
    try {
      // Un planning par rondier et par ronde, à l'heure de départ de la ronde
      for (const a of picked) {
        for (const rid of pickedRoutes) {
          const r = routes?.items.find((x) => x.id === rid);
          if (!r) continue;
          // eslint-disable-next-line no-await-in-loop
          await api('/schedules', {
            body: { route: rid, assignedAgent: a, startTimes: [startOf(r)], daysOfWeek: days, windowMinutes: 60, ...bounds },
          });
        }
      }
      toast('Planification enregistrée');
      router.push('/superviseur/calendrier');
    } catch (e) {
      toast((e as Error).message, 'error');
      setBusy(false);
      reload(true);
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
  const periodLabel = (s: Schedule) => (s.validFrom || s.validUntil ? `Du ${fmtDate(s.validFrom)} au ${fmtDate(s.validUntil)}` : 'Sans date de fin');
  const total = picked.length * pickedRoutes.length;

  return (
    <>
      <PageHeader title="Planification" subtitle="Cochez les rondiers, cochez les rondes : l’heure de départ de chaque ronde est reprise automatiquement." />

      <Card title="Nouvelle planification">
        <div className="grid gap-5 p-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium text-steel-2">1. Rondier(s)</p>
            <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-lg border border-line p-3">
              {!agents?.items.length && <p className="text-sm text-steel">Aucun rondier. Créez-en dans « Master Rondier ».</p>}
              {agents?.items.map((a) => (
                <Checkbox
                  key={a.id}
                  label={`${a.firstName} ${a.lastName}${a.matricule ? ` (${a.matricule})` : ''}`}
                  checked={picked.includes(a.id)}
                  onChange={(e) => toggleAgent(a.id, e.target.checked)}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-steel-2">2. Ronde(s)</p>
            <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-lg border border-line p-3">
              {!picked.length && <p className="text-sm text-steel">Cochez d’abord un rondier.</p>}
              {!!picked.length && !availableRoutes.length && <p className="text-sm text-steel">Aucune ronde. Créez-en dans « Master Ronde ».</p>}
              {!!picked.length &&
                availableRoutes.map((r) => {
                  const st = startOf(r);
                  return (
                    <div key={r.id} className="flex items-center gap-2">
                      <div className="flex-1">
                        <Checkbox
                          label={`${r.name} · ${siteNameOf(r.site)}`}
                          checked={pickedRoutes.includes(r.id)}
                          disabled={!st}
                          onChange={(e) => setPickedRoutes((l) => (e.target.checked ? [...l, r.id] : l.filter((x) => x !== r.id)))}
                        />
                      </div>
                      {st ? (
                        <span className="flex items-center gap-1 rounded bg-sky-950 px-2 py-0.5 font-mono text-xs text-sky-300">
                          <Clock className="h-3 w-3" /> {st}
                        </span>
                      ) : (
                        <Link href="/superviseur/rondes" className="text-[11px] text-amber-400 hover:underline">
                          sans heure : à définir dans Master Ronde
                        </Link>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-steel-2">3. Jours de la semaine</p>
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
          <div className="space-y-3">
            <Field label="4. Période">
              <Select value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
                <option value="always">Chaque semaine, sans date de fin</option>
                <option value="month">Un mois entier</option>
                <option value="range">Des dates précises</option>
              </Select>
            </Field>
            {period === 'month' && (
              <Field label="Mois">
                <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
              </Field>
            )}
            {period === 'range' && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Du">
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </Field>
                <Field label="Au">
                  <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
                </Field>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
          <p className="text-xs text-steel">
            {total > 0 ? `${picked.length} rondier(s) × ${pickedRoutes.length} ronde(s) : chaque rondier effectuera chaque ronde à son heure de départ.` : ''}
          </p>
          <Button loading={busy} disabled={!picked.length || !pickedRoutes.length || !days.length} onClick={save}>
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
                    <p className="font-medium text-white">{s.assignedAgent ? `${s.assignedAgent.firstName} ${s.assignedAgent.lastName}` : 'Non affecté'}</p>
                    <p className="text-xs text-steel">
                      {s.route?.name} · {s.site?.name}
                    </p>
                  </div>
                  <div className="text-right text-xs text-steel-2">
                    <p className="font-mono text-white">{s.startTimes.join(' · ') || '—'}</p>
                    <p>{s.daysOfWeek.length === 7 ? 'Tous les jours' : [...s.daysOfWeek].sort().map((d) => DAYS[d]).join(' ')}</p>
                    <p className="text-steel">{periodLabel(s)}</p>
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
