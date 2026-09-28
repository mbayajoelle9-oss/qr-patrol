'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useSocketEvent } from '@/lib/socket';
import { durationMin, fmtDateTime } from '@/lib/format';
import type { Intervention } from '@/lib/types';
import { Button, Card, Empty, ErrorBox, Loading, PageHeader, Select, Table, Td, Th, useToast } from '@/components/ui';
import { InterventionBadge, SeverityBadge } from '@/components/StatusBadges';

export default function InterventionsPage() {
  const toast = useToast();
  const [status, setStatus] = useState('active');
  const { data, loading, error, reload } = useApi<{ items: Intervention[] }>('/interventions', { status, limit: 100 });
  useSocketEvent('intervention:updated', () => reload(true));

  async function update(id: string, s: string) {
    try {
      await api(`/interventions/${id}`, { method: 'PATCH', body: { status: s } });
      reload(true);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  return (
    <>
      <PageHeader title="Interventions" subtitle="Équipes envoyées sur incident et suivi jusqu’à la résolution" />
      <Card>
        <div className="border-b border-line p-3">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="!w-56">
            <option value="active">En cours</option>
            <option value="completed">Terminées</option>
            <option value="cancelled">Annulées</option>
            <option value="">Toutes</option>
          </Select>
        </div>
        <ErrorBox error={error} />
        {loading && !data ? (
          <Loading />
        ) : !data?.items.length ? (
          <Empty>Aucune intervention.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Incident</Th>
                <Th>Gravité</Th>
                <Th>Site</Th>
                <Th>Équipe</Th>
                <Th>Envoyée</Th>
                <Th>Délai d’arrivée</Th>
                <Th>Statut</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {data.items.map((iv) => (
                <tr key={iv.id} className="hover:bg-white/5">
                  <Td>
                    <Link href={`/incidents/${iv.incident?.id}`} className="font-mono text-xs text-white hover:text-brand">
                      {iv.incident?.reference}
                    </Link>
                  </Td>
                  <Td>{iv.incident && <SeverityBadge severity={iv.incident.severity} />}</Td>
                  <Td>{iv.incident?.site?.name || '—'}</Td>
                  <Td className="text-white">
                    {iv.team?.name || iv.members.map((m) => m.firstName).join(', ')}
                    {iv.team?.callSign && <span className="text-steel"> · {iv.team.callSign}</span>}
                  </Td>
                  <Td>{fmtDateTime(iv.dispatchedAt)}</Td>
                  <Td>{iv.onSiteAt ? durationMin(iv.dispatchedAt, iv.onSiteAt) : iv.status === 'completed' ? '—' : `${durationMin(iv.dispatchedAt)} (en cours)`}</Td>
                  <Td>
                    <InterventionBadge status={iv.status} />
                  </Td>
                  <Td className="whitespace-nowrap text-right">
                    {iv.status === 'dispatched' && (
                      <Button size="sm" variant="secondary" onClick={() => update(iv.id, 'en_route')}>
                        En route
                      </Button>
                    )}{' '}
                    {['dispatched', 'en_route'].includes(iv.status) && (
                      <Button size="sm" variant="secondary" onClick={() => update(iv.id, 'on_site')}>
                        Sur place
                      </Button>
                    )}{' '}
                    {['dispatched', 'en_route', 'on_site'].includes(iv.status) && (
                      <Button size="sm" onClick={() => update(iv.id, 'completed')}>
                        Terminer
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
