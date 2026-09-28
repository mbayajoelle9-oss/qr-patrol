'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import clsx from 'clsx';
import { ArrowDown, ArrowLeft, ArrowUp, Pencil, Plus, Printer, QrCode, RefreshCw, Route as RouteIcon, Trash2 } from 'lucide-react';
import { api, downloadFile } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { fmtDate, toLatLng } from '@/lib/format';
import type { Checkpoint, PatrolRoute, Site } from '@/lib/types';
import MapView, { type MapMarker } from '@/components/MapView';
import { QrImage } from '@/components/QrImage';
import { SiteFormFields, siteFormToBody, type SiteForm } from '@/components/SiteForm';
import { Badge, Button, Card, Checkbox, Empty, ErrorBox, Field, Input, Loading, Modal, Table, Td, Textarea, Th, useToast } from '@/components/ui';

type Tab = 'points' | 'parcours' | 'infos';
const emptyCp = { name: '', code: '', description: '', instructions: '', lat: '', lng: '', radius: '', requireGps: true, requirePhoto: false };

export default function SiteDetail() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const { isAdmin } = useAuth();
  const { data, loading, error, reload } = useApi<{ site: Site; checkpoints: Checkpoint[]; routes: PatrolRoute[] }>(`/sites/${id}`);
  const { data: cpData, reload: reloadCps } = useApi<{ items: Checkpoint[] }>('/checkpoints', { site: id });
  const [tab, setTab] = useState<Tab>('points');

  // Point de contrôle
  const [cpOpen, setCpOpen] = useState<null | 'new' | Checkpoint>(null);
  const [cpForm, setCpForm] = useState(emptyCp);
  const [qrCp, setQrCp] = useState<Checkpoint | null>(null);
  // Parcours
  const [routeOpen, setRouteOpen] = useState<null | 'new' | PatrolRoute>(null);
  const [routeForm, setRouteForm] = useState<{ name: string; description: string; strictOrder: boolean; expectedDurationMinutes: number; items: { checkpoint: string; optional: boolean }[] }>({
    name: '',
    description: '',
    strictOrder: false,
    expectedDurationMinutes: 30,
    items: [],
  });
  // Site
  const [siteOpen, setSiteOpen] = useState(false);
  const [siteForm, setSiteForm] = useState<SiteForm | null>(null);
  const [busy, setBusy] = useState(false);

  const checkpoints = cpData?.items || [];
  const activeCps = checkpoints.filter((c) => c.active);
  const site = data?.site;

  const siteMarkers = useMemo<MapMarker[]>(() => {
    const m: MapMarker[] = [];
    const sl = toLatLng(site?.location);
    if (sl) m.push({ id: 'site', lat: sl[0], lng: sl[1], kind: 'site', radius: site?.geofenceRadius });
    activeCps.forEach((c) => {
      const ll = toLatLng(c.location);
      if (ll) m.push({ id: c.id, lat: ll[0], lng: ll[1], kind: 'checkpoint', radius: c.radius || 50, label: `${c.code || ''} ${c.name}` });
    });
    return m;
  }, [site, activeCps]);

  function openCp(c: 'new' | Checkpoint) {
    setCpOpen(c);
    if (c === 'new') setCpForm(emptyCp);
    else {
      const ll = toLatLng(c.location);
      setCpForm({
        name: c.name,
        code: c.code || '',
        description: c.description || '',
        instructions: c.instructions || '',
        lat: ll ? String(ll[0]) : '',
        lng: ll ? String(ll[1]) : '',
        radius: c.radius ? String(c.radius) : '',
        requireGps: c.requireGps,
        requirePhoto: c.requirePhoto,
      });
    }
  }

  async function saveCp() {
    setBusy(true);
    const body = {
      name: cpForm.name,
      code: cpForm.code || undefined,
      description: cpForm.description || undefined,
      instructions: cpForm.instructions || undefined,
      lat: cpForm.lat ? Number(cpForm.lat) : null,
      lng: cpForm.lng ? Number(cpForm.lng) : null,
      radius: cpForm.radius ? Number(cpForm.radius) : null,
      requireGps: cpForm.requireGps,
      requirePhoto: cpForm.requirePhoto,
    };
    try {
      if (cpOpen === 'new') await api('/checkpoints', { body: { ...body, site: id } });
      else if (cpOpen) await api(`/checkpoints/${cpOpen.id}`, { method: 'PATCH', body });
      toast('Point de contrôle enregistré');
      setCpOpen(null);
      reloadCps(true);
      reload(true);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function removeCp(c: Checkpoint) {
    if (!confirm(`Désactiver le point « ${c.name} » ?`)) return;
    await api(`/checkpoints/${c.id}`, { method: 'DELETE' });
    reloadCps(true);
  }

  async function regenerate(c: Checkpoint) {
    if (!confirm('Générer un nouveau QR Code ? L’étiquette actuellement posée ne fonctionnera plus : il faudra imprimer et poser la nouvelle.')) return;
    const r = await api<{ checkpoint: Checkpoint }>(`/checkpoints/${c.id}/regenerate-qr`, { body: {} });
    setQrCp(r.checkpoint);
    toast('Nouveau QR Code généré — pensez à remplacer l’étiquette');
    reloadCps(true);
  }

  async function printLabels(ids?: string[]) {
    try {
      await downloadFile('/checkpoints/labels.pdf', ids ? { ids: ids.join(',') } : { site: id }, undefined, true);
      reloadCps(true);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  function openRoute(r: 'new' | PatrolRoute) {
    setRouteOpen(r);
    if (r === 'new') {
      setRouteForm({ name: '', description: '', strictOrder: false, expectedDurationMinutes: 30, items: activeCps.map((c) => ({ checkpoint: c.id, optional: false })) });
    } else {
      setRouteForm({
        name: r.name,
        description: r.description || '',
        strictOrder: r.strictOrder,
        expectedDurationMinutes: r.expectedDurationMinutes,
        items: [...r.checkpoints]
          .sort((a, b) => a.order - b.order)
          .map((c) => ({ checkpoint: typeof c.checkpoint === 'string' ? c.checkpoint : c.checkpoint.id, optional: !!c.optional })),
      });
    }
  }

  function moveItem(i: number, d: -1 | 1) {
    setRouteForm((f) => {
      const items = [...f.items];
      const j = i + d;
      if (j < 0 || j >= items.length) return f;
      [items[i], items[j]] = [items[j], items[i]];
      return { ...f, items };
    });
  }

  async function saveRoute() {
    setBusy(true);
    const body = {
      name: routeForm.name,
      description: routeForm.description || undefined,
      strictOrder: routeForm.strictOrder,
      expectedDurationMinutes: Number(routeForm.expectedDurationMinutes),
      checkpoints: routeForm.items,
    };
    try {
      if (routeOpen === 'new') await api('/routes', { body: { ...body, site: id } });
      else if (routeOpen) await api(`/routes/${routeOpen.id}`, { method: 'PATCH', body });
      toast('Parcours enregistré');
      setRouteOpen(null);
      reload(true);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function saveSite() {
    if (!siteForm) return;
    setBusy(true);
    try {
      await api(`/sites/${id}`, { method: 'PATCH', body: siteFormToBody(siteForm) });
      toast('Site mis à jour');
      setSiteOpen(false);
      reload(true);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox error={error} />;
  if (!data || !site) return null;
  const cpName = (cid: string) => checkpoints.find((c) => c.id === cid);

  const cpLat = parseFloat(cpForm.lat);
  const cpLng = parseFloat(cpForm.lng);

  return (
    <>
      <Link href="/admin/sites" className="mb-3 inline-flex items-center gap-1 text-sm text-steel hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Sites
      </Link>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-steel">{site.code}</p>
          <h1 className="text-2xl font-bold text-white">{site.name}</h1>
          <p className="text-sm text-steel">{[site.address, site.city, site.client && `Client : ${site.client}`].filter(Boolean).join(' · ')}</p>
        </div>
        {isAdmin && (
          <Button
            variant="secondary"
            onClick={() => {
              const ll = toLatLng(site.location);
              setSiteForm({
                name: site.name,
                code: site.code || '',
                client: site.client || '',
                address: site.address || '',
                city: site.city || '',
                lat: ll ? String(ll[0]) : '',
                lng: ll ? String(ll[1]) : '',
                geofenceRadius: site.geofenceRadius || 300,
                contactName: site.contactName || '',
                contactPhone: site.contactPhone || '',
                instructions: site.instructions || '',
              });
              setSiteOpen(true);
            }}
          >
            <Pencil className="h-4 w-4" /> Modifier le site
          </Button>
        )}
      </div>

      <div className="mb-4 flex gap-1 border-b border-line">
        {(
          [
            ['points', `Points de contrôle (${activeCps.length})`],
            ['parcours', `Parcours de ronde (${data.routes.filter((r) => r.active).length})`],
            ['infos', 'Carte & consignes'],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx('-mb-px border-b-2 px-4 py-2 text-sm', tab === t ? 'border-brand text-white' : 'border-transparent text-steel hover:text-white')}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'points' && (
        <Card
          actions={
            <>
              <Button size="sm" variant="secondary" onClick={() => printLabels()} disabled={!activeCps.length}>
                <Printer className="h-3.5 w-3.5" /> Imprimer toutes les étiquettes
              </Button>
              {isAdmin && (
                <Button size="sm" onClick={() => openCp('new')}>
                  <Plus className="h-3.5 w-3.5" /> Ajouter un point
                </Button>
              )}
            </>
          }
          title="Points de contrôle"
        >
          {!checkpoints.length ? (
            <Empty>Aucun point. Ajoutez les points stratégiques (entrée, parking, entrepôt, clôture…).</Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Code</Th>
                  <Th>Nom</Th>
                  <Th>Position</Th>
                  <Th>Rayon</Th>
                  <Th>Exigences</Th>
                  <Th>QR</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {checkpoints.map((c) => (
                  <tr key={c.id} className={clsx(!c.active && 'opacity-40')}>
                    <Td className="font-mono text-white">{c.code}</Td>
                    <Td className="text-white">
                      {c.name}
                      {c.instructions && <div className="max-w-xs truncate text-[11px] text-steel">{c.instructions}</div>}
                    </Td>
                    <Td>{toLatLng(c.location) ? <Badge tone="success">calibrée</Badge> : <Badge tone="warning">à définir</Badge>}</Td>
                    <Td>{c.radius || '—'} m</Td>
                    <Td className="text-xs">
                      {c.requireGps && 'GPS'} {c.requirePhoto && '· Photo'}
                    </Td>
                    <Td className="text-xs">
                      v{c.qrVersion} {c.qrPrintedAt ? <span className="text-steel">· imprimé {fmtDate(c.qrPrintedAt)}</span> : <span className="text-amber-400">· non imprimé</span>}
                    </Td>
                    <Td className="whitespace-nowrap text-right">
                      <Button size="sm" variant="ghost" onClick={() => setQrCp(c)} title="QR Code">
                        <QrCode className="h-4 w-4" />
                      </Button>
                      {isAdmin && c.active && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => openCp(c)} title="Modifier">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => removeCp(c)} title="Désactiver">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {tab === 'parcours' && (
        <Card
          title="Parcours de ronde"
          actions={
            isAdmin && (
              <Button size="sm" onClick={() => openRoute('new')} disabled={!activeCps.length}>
                <Plus className="h-3.5 w-3.5" /> Nouveau parcours
              </Button>
            )
          }
        >
          {!data.routes.length ? (
            <Empty>Aucun parcours. Un parcours est la liste ordonnée des points qu’un agent doit contrôler.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {data.routes.map((r) => (
                <li key={r.id} className={clsx('flex items-start gap-4 px-4 py-4', !r.active && 'opacity-40')}>
                  <RouteIcon className="mt-1 h-5 w-5 text-brand" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-white">
                      {r.name} {r.strictOrder && <Badge tone="info">ordre imposé</Badge>}
                    </p>
                    <p className="mt-1 text-xs text-steel">
                      {[...r.checkpoints]
                        .sort((a, b) => a.order - b.order)
                        .map((c) => {
                          const cp = cpName(typeof c.checkpoint === 'string' ? c.checkpoint : c.checkpoint.id);
                          return `${cp?.code || ''} ${cp?.name || '?'}${c.optional ? ' (fac.)' : ''}`;
                        })
                        .join(' → ')}
                    </p>
                    <p className="mt-1 text-[11px] text-steel">Durée prévue : {r.expectedDurationMinutes} min</p>
                  </div>
                  {isAdmin && r.active && (
                    <Button size="sm" variant="ghost" onClick={() => openRoute(r)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'infos' && (
        <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
          <Card title="Plan du site" className="overflow-hidden">
            <div className="h-[520px]">
              <MapView markers={siteMarkers} />
            </div>
          </Card>
          <Card title="Informations">
            <dl className="space-y-3 p-4 text-sm">
              <div>
                <dt className="text-steel">Contact</dt>
                <dd className="text-white">{[site.contactName, site.contactPhone].filter(Boolean).join(' · ') || '—'}</dd>
              </div>
              <div>
                <dt className="text-steel">Rayon du site (géofence)</dt>
                <dd className="text-white">{site.geofenceRadius} m</dd>
              </div>
              <div>
                <dt className="text-steel">Consignes</dt>
                <dd className="whitespace-pre-wrap text-white">{site.instructions || '—'}</dd>
              </div>
            </dl>
          </Card>
        </div>
      )}

      {/* Modale point de contrôle */}
      <Modal
        open={!!cpOpen}
        onClose={() => setCpOpen(null)}
        title={cpOpen === 'new' ? 'Nouveau point de contrôle' : 'Modifier le point'}
        wide
        footer={
          <Button loading={busy} disabled={!cpForm.name} onClick={saveCp}>
            Enregistrer
          </Button>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <div className="grid grid-cols-[100px_1fr] gap-3">
              <Field label="Code">
                <Input value={cpForm.code} onChange={(e) => setCpForm({ ...cpForm, code: e.target.value })} placeholder="auto" />
              </Field>
              <Field label="Nom *">
                <Input value={cpForm.name} onChange={(e) => setCpForm({ ...cpForm, name: e.target.value })} placeholder="Entrée principale" />
              </Field>
            </div>
            <Field label="Consigne affichée à l’agent après le scan">
              <Textarea value={cpForm.instructions} onChange={(e) => setCpForm({ ...cpForm, instructions: e.target.value })} />
            </Field>
            <Field label="Description interne">
              <Input value={cpForm.description} onChange={(e) => setCpForm({ ...cpForm, description: e.target.value })} />
            </Field>
            <Field label="Rayon de tolérance GPS (m)" hint="Au-delà, le passage est signalé « agent trop éloigné ». Vide = valeur par défaut de la société.">
              <Input type="number" value={cpForm.radius} onChange={(e) => setCpForm({ ...cpForm, radius: e.target.value })} />
            </Field>
            <div className="flex gap-6 pt-1">
              <Checkbox label="GPS obligatoire" checked={cpForm.requireGps} onChange={(e) => setCpForm({ ...cpForm, requireGps: e.target.checked })} />
              <Checkbox label="Photo obligatoire" checked={cpForm.requirePhoto} onChange={(e) => setCpForm({ ...cpForm, requirePhoto: e.target.checked })} />
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-xs text-steel">
              Cliquez sur la carte (vue satellite conseillée) pour positionner le point. Vous pouvez aussi le calibrer sur place depuis l’app mobile.
            </p>
            <div className="h-72 overflow-hidden rounded-lg border border-line">
              <MapView
                onPick={(la, ln) => setCpForm({ ...cpForm, lat: la.toFixed(6), lng: ln.toFixed(6) })}
                markers={[
                  ...siteMarkers.filter((m) => cpOpen === 'new' || (cpOpen && m.id !== cpOpen.id)),
                  ...(!Number.isNaN(cpLat) && !Number.isNaN(cpLng)
                    ? [{ id: 'pick', lat: cpLat, lng: cpLng, kind: 'pick' as const, radius: Number(cpForm.radius) || 50 }]
                    : []),
                ]}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Latitude">
                <Input value={cpForm.lat} onChange={(e) => setCpForm({ ...cpForm, lat: e.target.value })} />
              </Field>
              <Field label="Longitude">
                <Input value={cpForm.lng} onChange={(e) => setCpForm({ ...cpForm, lng: e.target.value })} />
              </Field>
            </div>
          </div>
        </div>
      </Modal>

      {/* Modale QR */}
      <Modal open={!!qrCp} onClose={() => setQrCp(null)} title={qrCp ? `QR Code — ${qrCp.code || ''} ${qrCp.name}` : ''}>
        {qrCp?.qrPayload && (
          <div className="flex flex-col items-center gap-4">
            <div className="rounded-xl bg-white p-4">
              <QrImage value={qrCp.qrPayload} size={240} />
            </div>
            <p className="text-center text-xs text-steel">
              Version {qrCp.qrVersion} · QR signé : une copie modifiée ou un QR d’un autre système sera rejeté.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="secondary" onClick={() => printLabels([qrCp.id])}>
                <Printer className="h-4 w-4" /> Imprimer l’étiquette
              </Button>
              {isAdmin && (
                <Button variant="danger" onClick={() => regenerate(qrCp)}>
                  <RefreshCw className="h-4 w-4" /> Révoquer & régénérer
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Modale parcours */}
      <Modal
        open={!!routeOpen}
        onClose={() => setRouteOpen(null)}
        title={routeOpen === 'new' ? 'Nouveau parcours' : 'Modifier le parcours'}
        footer={
          <Button loading={busy} disabled={!routeForm.name || !routeForm.items.length} onClick={saveRoute}>
            Enregistrer
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="Nom *">
            <Input value={routeForm.name} onChange={(e) => setRouteForm({ ...routeForm, name: e.target.value })} placeholder="Ronde complète" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Durée prévue (min)">
              <Input type="number" value={routeForm.expectedDurationMinutes} onChange={(e) => setRouteForm({ ...routeForm, expectedDurationMinutes: Number(e.target.value) })} />
            </Field>
            <div className="flex items-end pb-2">
              <Checkbox label="Imposer l’ordre des points" checked={routeForm.strictOrder} onChange={(e) => setRouteForm({ ...routeForm, strictOrder: e.target.checked })} />
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-steel-2">Points du parcours (dans l’ordre)</p>
            <ol className="space-y-1.5">
              {routeForm.items.map((it, i) => {
                const cp = cpName(it.checkpoint);
                return (
                  <li key={it.checkpoint} className="flex items-center gap-2 rounded-lg border border-line bg-ink px-3 py-2 text-sm">
                    <span className="w-5 text-steel">{i + 1}.</span>
                    <span className="flex-1 text-white">
                      {cp?.code} {cp?.name}
                    </span>
                    <label className="flex items-center gap-1 text-[11px] text-steel">
                      <input
                        type="checkbox"
                        checked={it.optional}
                        className="accent-[#e92026]"
                        onChange={(e) =>
                          setRouteForm((f) => ({ ...f, items: f.items.map((x, j) => (j === i ? { ...x, optional: e.target.checked } : x)) }))
                        }
                      />
                      facultatif
                    </label>
                    <button className="p-1 text-steel hover:text-white" onClick={() => moveItem(i, -1)}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button className="p-1 text-steel hover:text-white" onClick={() => moveItem(i, 1)}>
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button className="p-1 text-steel hover:text-brand" onClick={() => setRouteForm((f) => ({ ...f, items: f.items.filter((_, j) => j !== i) }))}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ol>
            {activeCps.some((c) => !routeForm.items.find((x) => x.checkpoint === c.id)) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {activeCps
                  .filter((c) => !routeForm.items.find((x) => x.checkpoint === c.id))
                  .map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setRouteForm((f) => ({ ...f, items: [...f.items, { checkpoint: c.id, optional: false }] }))}
                      className="rounded-md border border-dashed border-line px-2 py-1 text-xs text-steel hover:border-brand hover:text-white"
                    >
                      + {c.code} {c.name}
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={siteOpen}
        onClose={() => setSiteOpen(false)}
        title="Modifier le site"
        wide
        footer={
          <Button loading={busy} onClick={saveSite}>
            Enregistrer
          </Button>
        }
      >
        {siteForm && <SiteFormFields form={siteForm} setForm={setSiteForm} />}
      </Modal>
    </>
  );
}
