'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { CalendarDays, Trash2 } from 'lucide-react';
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
 * Planification : on associe un ou plusieurs rondiers à une ronde existante. L'heure de départ vient de
 * la ronde (modifiable). Une période peut être fixée (un mois, ou des dates précises). Ensuite le
 * calendrier s'ouvre.
 */
export default function PlanificationPage() {
  const toast = useToast();
  const router = useRouter();
  const now = new Date();
  const { data: agents } = useApi<{ items: User[] }>('/users', { role: 'agent', active: true });
  const { data: routes } = useApi<{ items: PatrolRoute[] }>('/routes', { active: true });
  const { data: schedules, loading, error, reload } = useApi<{ items: Schedule[] }>('/schedules');
  const [picked, setPicked] = useState<string[]>([]);
  const [route, setRoute] = useState('');
  const [startTime, setStartTime] = useState('');
  const [days, setDays] = useState<number[]>(ALL_DAYS);
  const [period, setPeriod] = useState<Period>('always');
  const [month, setMonth] = useState(`${now.getFullYear()}-${pad(now.getMonth() + 1)}`);
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const [busy, setBusy] = useState(false);

  const selectedAgents = useMemo(() => (agents?.items || []).filter((a) => picked.includes(a.id)), [agents, picked]);

  // Si les rondiers choisis sont rattachés à des sites, on ne propose que les rondes de ces sites
  const availableRoutes = useMemo(() => {
    const list = routes?.items || [];
    const lists = selectedAgents.map((a) => (a.sites || []).map((s) => s.id)).filter((l) => l.length);
    return lists.length ? list.filter((r) => lists.every((l) => l.includes(siteIdOf(r.site)))) : list;
  }, [routes, selectedAgents]);

  function pickRoute(id: string) {
    setRoute(id);
    const r = routes?.items.find((x) => x.id === id);
    // Heure définie à la création de la ronde ; à défaut, celle d'un planning existant sur cette ronde
    const known = r?.startTime || schedules?.items.find((s) => s.route?.id === id && s.startTimes.length)?.startTimes[0] || '';
    setStartTime(known);
  }

  function toggleAgent(id: string, on: boolean) {
    setPicked((l) => (on ? [...l, id] : l.filter((x) => x !== id)));
    setRoute('');
    setStartTime('');
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
    if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(startTime)) {
      toast('Indiquez l’heure de départ', 'error');
      return;
    }
    const bounds = periodBounds();
    if (typeof bounds === 'string') {
      toast(bounds, 'error');
      return;
    }
    setBusy(true);
    try {
      // Un planning par rondier : chacun effectue la ronde à l'heure indiquée
      for (const a of picked) {
        // eslint-disable-next-line no-await-in-loop
        await api('/schedules', {
          body: { route, assignedAgent: a, startTimes: [startTime], daysOfWeek: days, windowMinutes: 60, ...bounds },
        });
      }
      toast(picked.length > 1 ? `${picked.length} rondiers planifiés` : 'Rondier planifié');
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
  const periodLabel = (s: Schedule) =>
    s.validFrom || s.validUntil ? `Du ${fmtDate(s.validFrom)} au ${fmtDate(s.validUntil)}` : 'Sans date de fin';

  return (
    <>
      <PageHeader title="Planification" subtitle="Associez un ou plusieurs rondiers à une ronde. Ils la verront sur leur téléphone." />

      <Card title="Nouvelle planification">
        <div className="grid gap-5 p-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium text-steel-2">1. Rondier(s) * — cochez un ou plusieurs</p>
            <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-lg border border-line p-3">
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
          <div className="space-y-4">
            <Field label="2. Ronde *" hint={picked.length ? undefined : 'Choisissez d’abord au moins un rondier'}>
              <Select value={route} onChange={(e) => pickRoute(e.target.value)} disabled={!picked.length}>
                <option value="">— Choisir une ronde —</option>
                {availableRoutes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · {siteNameOf(r.site)}
                    {r.startTime ? ` · ${r.startTime}` : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="3. Heure de départ" hint={route && startTime ? 'Reprise automatiquement depuis la ronde' : route ? 'Cette ronde n’a pas d’heure : indiquez-la' : undefined}>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} disabled={!route} />
            </Field>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-steel-2">4. Jours de la semaine</p>
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
            <Field label="5. Période">
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
          <p className="text-xs text-steel">{picked.length > 1 ? `${picked.length} rondiers : chacun effectuera cette ronde.` : ''}</p>
          <Button loading={busy} disabled={!picked.length || !route || !startTime || !days.length} onClick={save}>
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
