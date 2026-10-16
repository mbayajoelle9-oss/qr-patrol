'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Clock, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import type { Checkpoint, PatrolRoute, Ref, Site } from '@/lib/types';
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select, useToast } from '@/components/ui';

const empty = { site: '', name: '', startTime: '18:00', points: [] as string[], strictOrder: false };

const siteId = (s: Ref | string) => (typeof s === 'string' ? s : s.id);
const siteName = (s: Ref | string) => (typeof s === 'string' ? '' : s.name || '');

/**
 * Master Ronde : le superviseur choisit un site (déjà configuré par l'administrateur) ; ses points de
 * contrôle sont proposés d'office. Il donne un nom, une heure de départ et peut retirer / réordonner
 * les points s'il le souhaite.
 */
export default function MasterRondePage() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi<{ items: PatrolRoute[] }>('/routes', { active: true });
  const { data: sites } = useApi<{ items: Site[] }>('/sites', { active: true });
  const [open, setOpen] = useState<null | 'new' | PatrolRoute>(null);
  const [form, setForm] = useState(empty);
  const [siteCps, setSiteCps] = useState<Checkpoint[]>([]);
  const [busy, setBusy] = useState(false);

  async function loadSitePoints(id: string, preselect: boolean) {
    if (!id) {
      setSiteCps([]);
      return;
    }
    try {
      const r = await api<{ items: Checkpoint[] }>('/checkpoints', { query: { site: id, active: true } });
      setSiteCps(r.items);
      if (preselect) setForm((f) => ({ ...f, points: r.items.map((c) => c.id) }));
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  function edit(r: 'new' | PatrolRoute) {
    setOpen(r);
    if (r === 'new') {
      const only = sites?.items.length === 1 ? sites.items[0].id : '';
      setForm({ ...empty, site: only });
      setSiteCps([]);
      if (only) loadSitePoints(only, true);
    } else {
      const sid = siteId(r.site);
      setForm({
        site: sid,
        name: r.name,
        startTime: r.startTime || '',
        points: [...r.checkpoints].sort((a, b) => a.order - b.order).map((c) => (typeof c.checkpoint === 'string' ? c.checkpoint : c.checkpoint.id)),
        strictOrder: r.strictOrder,
      });
      loadSitePoints(sid, false);
    }
  }

  const cpById = (id: string) => siteCps.find((c) => c.id === id);
  const move = (i: number, d: -1 | 1) =>
    setForm((f) => {
      const j = i + d;
      if (j < 0 || j >= f.points.length) return f;
      const p = [...f.points];
      [p[i], p[j]] = [p[j], p[i]];
      return { ...f, points: p };
    });

  async function save() {
    setBusy(true);
    try {
      if (open === 'new') {
        await api('/routes', {
          body: {
            site: form.site,
            name: form.name,
            startTime: form.startTime || null,
            strictOrder: form.strictOrder,
            checkpoints: form.points.map((id) => ({ checkpoint: id })),
          },
        });
      } else if (open) {
        await api(`/routes/${open.id}`, {
          method: 'PATCH',
          body: {
            name: form.name,
            startTime: form.startTime || null,
            strictOrder: form.strictOrder,
            checkpoints: form.points.map((id) => ({ checkpoint: id })),
          },
        });
      }
      toast('Ronde enregistrée');
      setOpen(null);
      reload(true);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function remove(r: PatrolRoute) {
    if (!confirm(`Supprimer la ronde « ${r.name} » ? Les plannings qui l’utilisent ne généreront plus de rondes.`)) return;
    try {
      await api(`/routes/${r.id}`, { method: 'DELETE' });
      toast('Ronde supprimée');
      reload(true);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  const missing = siteCps.filter((c) => !form.points.includes(c.id));

  return (
    <>
      <PageHeader
        title="Master Ronde"
        subtitle="Créez vos rondes : un site, une heure de départ, et les points à contrôler."
        actions={
          <Button onClick={() => edit('new')} disabled={!sites?.items.length}>
            <Plus className="h-4 w-4" /> Nouvelle ronde
          </Button>
        }
      />
      <ErrorBox error={error} />
      {loading && !data ? (
        <Loading />
      ) : !data?.items.length ? (
        <Card>
          <Empty>{sites?.items.length ? 'Aucune ronde. Cliquez sur « Nouvelle ronde » pour commencer.' : 'Aucun site configuré : demandez à l’administrateur de créer le site.'}</Empty>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.items.map((r) => (
            <Card key={r.id}>
              <div className="flex items-start gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white">{r.name}</p>
                  <p className="mt-0.5 text-sm text-steel">{siteName(r.site)}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-steel-2">
                    <Badge tone="info">
                      <Clock className="mr-1 inline h-3 w-3" />
                      {r.startTime || 'heure à choisir'}
                    </Badge>
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-brand" /> {r.checkpoints.length} point(s)
                    </span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" title="Modifier" onClick={() => edit(r)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" title="Supprimer" onClick={() => remove(r)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={!!open}
        onClose={() => setOpen(null)}
        title={open === 'new' ? 'Nouvelle ronde' : 'Modifier la ronde'}
        footer={
          <Button loading={busy} disabled={!form.site || !form.name || !form.points.length} onClick={save}>
            Enregistrer
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="Site *" hint={open === 'new' ? 'Les points du site sont proposés automatiquement' : 'Le site ne peut plus être changé'}>
            <Select
              value={form.site}
              disabled={open !== 'new'}
              onChange={(e) => {
                setForm({ ...form, site: e.target.value, points: [] });
                loadSitePoints(e.target.value, true);
              }}
            >
              <option value="">— Choisir —</option>
              {sites?.items.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nom de la ronde *">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex. Ronde de nuit" />
            </Field>
            <Field label="Heure de départ">
              <Input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
            </Field>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-steel-2">Points à contrôler (dans l’ordre de passage)</p>
            {!form.site ? (
              <p className="rounded-lg border border-dashed border-line p-3 text-sm text-steel">Choisissez d’abord un site.</p>
            ) : (
              <>
                <ol className="space-y-1.5">
                  {form.points.map((id, i) => {
                    const cp = cpById(id);
                    return (
                      <li key={id} className="flex items-center gap-2 rounded-lg border border-line bg-ink px-3 py-2 text-sm">
                        <span className="w-5 text-steel">{i + 1}.</span>
                        <span className="flex-1 text-white">
                          {cp?.code} {cp?.name}
                        </span>
                        <button type="button" className="p-1 text-steel hover:text-white" onClick={() => move(i, -1)} aria-label="Monter">
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" className="p-1 text-steel hover:text-white" onClick={() => move(i, 1)} aria-label="Descendre">
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="p-1 text-steel hover:text-brand"
                          onClick={() => setForm((f) => ({ ...f, points: f.points.filter((x) => x !== id) }))}
                          aria-label="Retirer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    );
                  })}
                </ol>
                {missing.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {missing.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, points: [...f.points, c.id] }))}
                        className="rounded-md border border-dashed border-line px-2 py-1 text-xs text-steel hover:border-brand hover:text-white"
                      >
                        + {c.code} {c.name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-steel-2">
            <input
              type="checkbox"
              checked={form.strictOrder}
              onChange={(e) => setForm({ ...form, strictOrder: e.target.checked })}
              className="h-4 w-4 rounded border-line accent-[#e92026]"
            />
            Le rondier doit scanner les points dans cet ordre
          </label>
        </div>
      </Modal>
    </>
  );
}
