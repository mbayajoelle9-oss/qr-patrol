'use client';

import { useRouter } from 'next/navigation';
import { Siren } from 'lucide-react';
import { fmtTime } from '@/lib/format';
import type { Incident } from '@/lib/types';
import { Button } from './ui';

/** Bandeau plein écran lorsqu'un agent déclenche un SOS. */
export function SosOverlay({ incidents, onDismiss }: { incidents: Incident[]; onDismiss: (id: string) => void }) {
  const router = useRouter();
  if (!incidents.length) return null;
  const sos = incidents[0];
  return (
    <div className="fixed inset-x-0 top-0 z-[2500] flex justify-center p-4">
      <div className="sos-pulse flex w-full max-w-3xl items-center gap-4 rounded-2xl border-2 border-white bg-brand px-5 py-4 text-white shadow-2xl">
        <Siren className="h-10 w-10 shrink-0 animate-bounce" />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-black uppercase tracking-wide">SOS — Agent en danger</p>
          <p className="truncate text-sm">
            {sos.reportedBy?.firstName} {sos.reportedBy?.lastName}
            {sos.site ? ` · ${sos.site.name}` : ''} · {fmtTime(sos.createdAt, true)}
            {incidents.length > 1 ? ` · +${incidents.length - 1} autre(s)` : ''}
          </p>
        </div>
        <Button
          variant="secondary"
          className="!bg-white !text-brand"
          onClick={() => {
            onDismiss(sos.id);
            router.push(`/incidents/${sos.id}`);
          }}
        >
          Intervenir
        </Button>
        <button className="text-xs underline opacity-80 hover:opacity-100" onClick={() => onDismiss(sos.id)}>
          Masquer
        </button>
      </div>
    </div>
  );
}
