'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import type { PatrolRoute, Ref, User } from '@/lib/types';
import { Button, Checkbox, Input, useToast } from '@/components/ui';

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const siteNameOf = (s: Ref | string) => (typeof s === 'string' ? '' : s.name || '');

/** Affecte le rondier à d'autres rondes existantes : on coche, c'est tout (l'heure vient de la ronde). */
export function AssignBox({ agent, date, routes, already, onDone }: { agent: User; date: Date; routes: PatrolRoute[]; already: Set<string | undefined>; onDone: () => void }) {
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
