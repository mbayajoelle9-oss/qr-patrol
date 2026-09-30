'use client';

import { useState } from 'react';
import { Check, Fingerprint, MapPin, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useSocketEvent } from '@/lib/socket';
import { fmtDateTime } from '@/lib/format';
import type { ScanEvent, Site, User } from '@/lib/types';
import MapView from '@/components/MapView';
import { Badge, Button, Card, Empty, ErrorBox, Input, Loading, Modal, PageHeader, Select, Table, Td, Th, useToast } from '@/components/ui';
import { ScanBadge } from '@/components/StatusBadges';

export default function ScansPage() {
  const toast = useToast();
  const [status, setStatus] = useState('suspicious,rejected');
  const [site, setSite] = useState('');
  const [agent, setAgent] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [toReview, setToReview] = useState(false);
  const { data, loading, error, reload } = useApi<{ items: ScanEvent[]; total: number }>('/scans', {
    status: status || undefined,
    site: site || undefined,
    agent: agent || undefined,
    from: from ? new Date(from).toISOString() : undefined,
    to: to ? new Date(to).toISOString() : undefined,
    reviewed: toReview ? 'false' : undefined,
    page,
    limit: 50,
  });
  const { data: sites } = useApi<{ items: Site[] }>('/sites');
  const { data: agents } = useApi<{ items: User[] }>('/users', { role: 'agent' });
  const [selected, setSelected] = useState<ScanEvent | null>(null);
  useSocketEvent('scan:new', () => page === 1 && reload(true));

  async function review(s: ScanEvent, decision: 'accepted' | 'rejected') {
    try {
      await api(`/scans/${s.id}/review`, { method: 'PATCH', body: { decision } });
      toast(decision === 'accepted' ? 'Passage validé après vérification' : 'Passage refusé');
      setSelected(null);
      reload(true);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  return (
    <>
      <PageHeader title="Passages & anomalies" subtitle="Chaque scan enregistre QR + GPS + heure + agent + téléphone. Les anomalies sont à vérifier ici." />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="!w-52">
            <option value="suspicious,rejected">Anomalies uniquement</option>
            <option value="">Tous les passages</option>
            <option value="valid">Validés</option>
            <option value="suspicious">Suspects</option>
            <option value="rejected">Rejetés</option>
          </Select>
          <Select value={site} onChange={(e) => { setSite(e.target.value); setPage(1); }} className="!w-48">
            <option value="">Tous les sites</option>
            {sites?.items.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select value={agent} onChange={(e) => { setAgent(e.target.value); setPage(1); }} className="!w-48">
            <option value="">Tous les rondiers</option>
            {agents?.items.map((a) => (
              <option key={a.id} value={a.id}>
                {a.firstName} {a.lastName}
              </option>
            ))}
          </Select>
          <Input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className="!w-52" title="Depuis" />
          <Input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} className="!w-52" title="Jusqu’à" />
          <label className="ml-1 flex items-center gap-2 text-xs text-steel-2">
            <input type="checkbox" checked={toReview} onChange={(e) => setToReview(e.target.checked)} className="accent-[#e92026]" /> Non vérifiés
          </label>
        </div>
        <ErrorBox error={error} />
        {loading && !data ? (
          <Loading />
        ) : !data?.items.length ? (
          <Empty>Aucun passage pour ces critères.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Heure</Th>
                <Th>Rondier</Th>
                <Th>Point</Th>
                <Th>Distance</Th>
                <Th>GPS</Th>
                <Th>Biométrie</Th>
                <Th>Anomalies</Th>
                <Th>Statut</Th>
                <Th>Vérification</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((s) => (
                <tr key={s.id} className="cursor-pointer hover:bg-white/5" onClick={() => setSelected(s)}>
                  <Td className="whitespace-nowrap">
                    {fmtDateTime(s.scannedAt)}
                    {s.offline && <Badge className="ml-1">hors-ligne</Badge>}
                  </Td>
                  <Td className="text-white">
                    {s.agent?.firstName} {s.agent?.lastName}
                  </Td>
                  <Td>
                    {s.checkpoint ? `${s.checkpoint.code || ''} ${s.checkpoint.name}` : <span className="text-brand">QR inconnu</span>}
                    <div className="text-[11px] text-steel">{s.site?.name}</div>
                  </Td>
                  <Td className="tabular-nums">{s.distanceMeters != null ? `${s.distanceMeters} m` : '—'}</Td>
                  <Td className="tabular-nums">{s.location?.accuracy != null ? `±${Math.round(s.location.accuracy)} m` : '—'}</Td>
                  <Td>
                    {s.biometricVerified ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                        <Fingerprint className="h-3.5 w-3.5" /> {s.biometricMethod === 'facial' ? 'Visage' : 'Empreinte'}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-400">
                        <Fingerprint className="h-3.5 w-3.5" /> non vérifié
                      </span>
                    )}
                  </Td>
                  <Td className="max-w-xs text-xs text-amber-300">{(s.flagLabels || s.flags).join(' · ') || '—'}</Td>
                  <Td>
                    <ScanBadge status={s.status} />
                  </Td>
                  <Td>
                    {s.reviewed?.decision ? (
                      <Badge tone={s.reviewed.decision === 'accepted' ? 'success' : 'danger'}>{s.reviewed.decision === 'accepted' ? 'Accepté' : 'Refusé'}</Badge>
                    ) : s.status !== 'valid' ? (
                      <span className="text-xs text-steel">à vérifier</span>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {data && data.total > 50 && (
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-xs text-steel">
            <span>{data.total} passages</span>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                Précédent
              </Button>
              <Button size="sm" variant="secondary" disabled={page * 50 >= data.total} onClick={() => setPage((p) => p + 1)}>
                Suivant
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Détail du passage"
        wide
        footer={
          selected && selected.status !== 'valid' && !selected.reviewed?.decision ? (
            <>
              <Button variant="danger" onClick={() => review(selected, 'rejected')}>
                <X className="h-4 w-4" /> Refuser
              </Button>
              <Button onClick={() => review(selected, 'accepted')}>
                <Check className="h-4 w-4" /> Accepter
              </Button>
            </>
          ) : undefined
        }
      >
        {selected && (
          <div className="grid gap-4 md:grid-cols-2">
            <dl className="grid grid-cols-[130px_1fr] gap-y-2 text-sm">
              <dt className="text-steel">Rondier</dt>
              <dd className="text-white">
                {selected.agent?.firstName} {selected.agent?.lastName} ({selected.agent?.matricule})
              </dd>
              <dt className="text-steel">Biométrie</dt>
              <dd className={selected.biometricVerified ? 'text-emerald-400' : 'text-amber-400'}>
                {selected.biometricVerified ? `Vérifiée (${selected.biometricMethod === 'facial' ? 'visage' : 'empreinte'})` : 'Non vérifiée'}
              </dd>
              <dt className="text-steel">Point</dt>
              <dd className="text-white">{selected.checkpoint?.name || 'QR inconnu'}</dd>
              <dt className="text-steel">Scanné à</dt>
              <dd>{fmtDateTime(selected.scannedAt)}</dd>
              <dt className="text-steel">Reçu à</dt>
              <dd>{fmtDateTime(selected.receivedAt)}</dd>
              <dt className="text-steel">Position</dt>
              <dd>
                {selected.location ? (
                  <>
                    <MapPin className="mr-1 inline h-3.5 w-3.5" />
                    {selected.location.lat.toFixed(6)}, {selected.location.lng.toFixed(6)} (±{Math.round(selected.location.accuracy || 0)} m)
                  </>
                ) : (
                  'absente'
                )}
              </dd>
              <dt className="text-steel">Distance au point</dt>
              <dd>{selected.distanceMeters != null ? `${selected.distanceMeters} m (rayon ${selected.checkpoint?.radius ?? '—'} m)` : '—'}</dd>
              <dt className="text-steel">Téléphone</dt>
              <dd>{selected.device?.model || selected.device?.deviceId || '—'}</dd>
              <dt className="text-steel">Anomalies</dt>
              <dd className="text-amber-300">{(selected.flagLabels || selected.flags).join(', ') || 'aucune'}</dd>
              {selected.comment && (
                <>
                  <dt className="text-steel">Commentaire</dt>
                  <dd>{selected.comment}</dd>
                </>
              )}
            </dl>
            <div className="h-72 overflow-hidden rounded-lg border border-line">
              <MapView
                fitKey={selected.id}
                markers={[
                  ...(selected.checkpoint?.location
                    ? [
                        {
                          id: 'cp',
                          lat: selected.checkpoint.location.coordinates[1],
                          lng: selected.checkpoint.location.coordinates[0],
                          kind: 'checkpoint' as const,
                          radius: selected.checkpoint.radius || 50,
                          label: selected.checkpoint.name,
                        },
                      ]
                    : []),
                  ...(selected.location
                    ? [{ id: 'scan', lat: selected.location.lat, lng: selected.location.lng, kind: selected.status === 'valid' ? ('scan-ok' as const) : ('scan-bad' as const), label: 'Scan' }]
                    : []),
                ]}
              />
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
