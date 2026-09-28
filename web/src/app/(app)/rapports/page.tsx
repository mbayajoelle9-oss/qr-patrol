'use client';

import { useMemo, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { downloadFile } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import type { Site } from '@/lib/types';
import { Button, Card, Empty, ErrorBox, Input, Loading, PageHeader, Select, Stat, Table, Td, Th, useToast } from '@/components/ui';

interface Summary {
  patrols: {
    byStatus: Record<string, number>;
    total: number;
    complianceRate: number | null;
    byDay: { date: string; total: number; completed: number; incomplete: number; missed: number }[];
  };
  scans: { byStatus: Record<string, number>; flags: { code: string; label: string; count: number }[] };
  agents: {
    id: string;
    name: string;
    matricule?: string;
    patrols: number;
    completed: number;
    missed: number;
    checkpointsDone: number;
    checkpointsTotal: number;
    suspicious: number;
    complianceRate: number | null;
  }[];
  sites: { id: string; name: string; total: number; completed: number; missed: number; complianceRate: number | null }[];
  incidents: { byType: { type: string; label: string; count: number }[]; total: number; avgAckMinutes: number | null; avgResolveMinutes: number | null };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default function RapportsPage() {
  const toast = useToast();
  const [from, setFrom] = useState(iso(new Date(Date.now() - 6 * 86400000)));
  const [to, setTo] = useState(iso(new Date()));
  const [site, setSite] = useState('');
  const query = useMemo(
    () => ({ from: new Date(`${from}T00:00:00+01:00`).toISOString(), to: new Date(`${to}T23:59:59+01:00`).toISOString(), site: site || undefined }),
    [from, to, site]
  );
  const { data, loading, error } = useApi<Summary>('/reports/summary', query);
  const { data: sites } = useApi<{ items: Site[] }>('/sites');
  const [busy, setBusy] = useState<string | null>(null);

  async function exp(kind: 'pdf' | 'csv') {
    setBusy(kind);
    try {
      if (kind === 'pdf') await downloadFile('/reports/activity.pdf', query, undefined, true);
      else await downloadFile('/reports/patrols.csv', query, `rondes-${from}_${to}.csv`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Rapports"
        subtitle="Vérifier le respect des consignes : rondes, itinéraires, anomalies et incidents"
        actions={
          <>
            <Button variant="secondary" loading={busy === 'csv'} onClick={() => exp('csv')}>
              <Download className="h-4 w-4" /> Excel (CSV)
            </Button>
            <Button loading={busy === 'pdf'} onClick={() => exp('pdf')}>
              <FileText className="h-4 w-4" /> Rapport PDF
            </Button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="!w-44" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="!w-44" />
        <Select value={site} onChange={(e) => setSite(e.target.value)} className="!w-56">
          <option value="">Tous les sites</option>
          {sites?.items.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>
      <ErrorBox error={error} />
      {loading && !data ? (
        <Loading />
      ) : data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat
              label="Conformité"
              value={data.patrols.complianceRate != null ? `${data.patrols.complianceRate}%` : '—'}
              tone={data.patrols.complianceRate == null ? undefined : data.patrols.complianceRate >= 90 ? 'success' : data.patrols.complianceRate >= 70 ? 'warning' : 'danger'}
            />
            <Stat label="Rondes complètes" value={data.patrols.byStatus.completed || 0} tone="success" />
            <Stat label="Incomplètes" value={data.patrols.byStatus.incomplete || 0} tone="warning" />
            <Stat label="Manquées" value={data.patrols.byStatus.missed || 0} tone={data.patrols.byStatus.missed ? 'danger' : undefined} />
            <Stat label="Incidents" value={data.incidents.total} hint={data.incidents.avgAckMinutes != null ? `prise en charge ~${data.incidents.avgAckMinutes} min` : undefined} />
            <Stat
              label="Scans suspects"
              value={(data.scans.byStatus.suspicious || 0) + (data.scans.byStatus.rejected || 0)}
              hint={`${data.scans.byStatus.valid || 0} valides`}
            />
          </div>

          <Card title="Rondes par jour">
            {data.patrols.byDay.length === 0 ? (
              <Empty>Aucune ronde sur la période.</Empty>
            ) : (
              <div className="h-72 p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.patrols.byDay}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2e" />
                    <XAxis dataKey="date" stroke="#9ca3af" fontSize={11} tickFormatter={(d: string) => d.slice(5)} />
                    <YAxis stroke="#9ca3af" fontSize={11} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: '#1c1c1f', border: '1px solid #2a2a2e', borderRadius: 8 }} />
                    <Legend />
                    <Bar dataKey="completed" name="Complètes" stackId="a" fill="#10b981" />
                    <Bar dataKey="incomplete" name="Incomplètes" stackId="a" fill="#f59e0b" />
                    <Bar dataKey="missed" name="Manquées" stackId="a" fill="#e92026" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card title="Performance par agent">
              {!data.agents.length ? (
                <Empty>Aucune donnée.</Empty>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Agent</Th>
                      <Th>Rondes</Th>
                      <Th>Manquées</Th>
                      <Th>Points</Th>
                      <Th>Suspects</Th>
                      <Th>Conformité</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.agents.map((a) => (
                      <tr key={a.id}>
                        <Td className="text-white">
                          {a.name} <span className="text-xs text-steel">{a.matricule}</span>
                        </Td>
                        <Td>{a.patrols}</Td>
                        <Td className={a.missed ? 'text-brand' : ''}>{a.missed}</Td>
                        <Td>
                          {a.checkpointsDone}/{a.checkpointsTotal}
                        </Td>
                        <Td className={a.suspicious ? 'text-amber-400' : ''}>{a.suspicious}</Td>
                        <Td className="font-semibold text-white">{a.complianceRate != null ? `${a.complianceRate}%` : '—'}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
            <div className="space-y-4">
              <Card title="Anomalies anti-fraude">
                {!data.scans.flags.length ? (
                  <Empty>Aucune anomalie. 👍</Empty>
                ) : (
                  <ul className="divide-y divide-line">
                    {data.scans.flags.map((f) => (
                      <li key={f.code} className="flex items-center justify-between px-4 py-2.5 text-sm">
                        <span className="text-steel-2">{f.label}</span>
                        <span className="font-semibold tabular-nums text-amber-400">{f.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card title="Incidents par type">
                {!data.incidents.byType.length ? (
                  <Empty>Aucun incident.</Empty>
                ) : (
                  <ul className="divide-y divide-line">
                    {data.incidents.byType.map((t) => (
                      <li key={t.type} className="flex items-center justify-between px-4 py-2.5 text-sm">
                        <span className="text-steel-2">{t.label}</span>
                        <span className="font-semibold tabular-nums text-white">{t.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>

          <Card title="Performance par site">
            {!data.sites.length ? (
              <Empty>Aucune donnée.</Empty>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Site</Th>
                    <Th>Rondes</Th>
                    <Th>Complètes</Th>
                    <Th>Manquées</Th>
                    <Th>Conformité</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.sites.map((s) => (
                    <tr key={s.id}>
                      <Td className="text-white">{s.name}</Td>
                      <Td>{s.total}</Td>
                      <Td>{s.completed}</Td>
                      <Td className={s.missed ? 'text-brand' : ''}>{s.missed}</Td>
                      <Td className="font-semibold text-white">{s.complianceRate != null ? `${s.complianceRate}%` : '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
      ) : null}
    </>
  );
}
