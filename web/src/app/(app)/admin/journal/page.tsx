'use client';

import { useState } from 'react';
import { useApi } from '@/lib/useApi';
import { fmtDateTime, ROLE_LABELS } from '@/lib/format';
import type { User } from '@/lib/types';
import { Button, Card, Empty, ErrorBox, Loading, PageHeader, Table, Td, Th } from '@/components/ui';

interface Log {
  _id: string;
  action: string;
  entity?: string;
  details?: Record<string, unknown>;
  user?: User;
  ip?: string;
  createdAt: string;
}

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const { data, loading, error } = useApi<{ items: Log[]; total: number }>('/audit', { page, limit: 50 });
  return (
    <>
      <PageHeader title="Journal d’audit" subtitle="Traçabilité des actions sensibles : QR régénérés, utilisateurs, paramètres, téléphones déliés…" />
      <Card>
        <ErrorBox error={error} />
        {loading && !data ? (
          <Loading />
        ) : !data?.items.length ? (
          <Empty>Aucune entrée.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Utilisateur</Th>
                <Th>Action</Th>
                <Th>Détails</Th>
                <Th>IP</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((l) => (
                <tr key={l._id}>
                  <Td className="whitespace-nowrap">{fmtDateTime(l.createdAt)}</Td>
                  <Td className="text-white">
                    {l.user ? `${l.user.firstName} ${l.user.lastName}` : '—'}
                    {l.user && <span className="ml-1 text-xs text-steel">{ROLE_LABELS[l.user.role]}</span>}
                  </Td>
                  <Td className="font-mono text-xs">{l.action}</Td>
                  <Td className="max-w-md truncate font-mono text-[11px] text-steel">{l.details ? JSON.stringify(l.details) : ''}</Td>
                  <Td className="text-xs">{l.ip}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {data && data.total > 50 && (
          <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
            <Button size="sm" variant="secondary" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              Précédent
            </Button>
            <Button size="sm" variant="secondary" disabled={page * 50 >= data.total} onClick={() => setPage((p) => p + 1)}>
              Suivant
            </Button>
          </div>
        )}
      </Card>
    </>
  );
}
