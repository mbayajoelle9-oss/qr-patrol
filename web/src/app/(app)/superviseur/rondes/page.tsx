'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Clock, MapPin, Pencil, Plus, Trash2, Wand2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import type { Checkpoint, PatrolRoute, Ref, Site } from '@/lib/types';
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select, useToast } from '@/components/ui';

interface Point {
  id: string;
  offset: string; // minutes après le départ ('' = pas de contrainte horaire)
  window: string; // tolérance en minutes
}

const empty = { site: '', name: '', startTime: '18:00', duration: '30', points: [] as Point[], strictOrder: false };

const siteId = (s: Ref | string) => (typeof s === 'string' ? s : s.id);
const siteName = (s: Ref | string) => (typeof s === 'string' ? '' : s.name || '');
const cpId = (c: Checkpoint | string) => (typeof c === 'string' ? c : c.id);

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const toHHMM = (min: number) => {
  const t = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

function pointsFromRoute(r: PatrolRoute): Point[] {
  return [...r.checkpoints]
    .sort((a, b) => a.order - b.order)
    .map((c) => ({
      id: cpId(c.checkpoint),
      offset: c.expectedOffsetMinutes != null ? String(c.expectedOffsetMinutes) : '',
      window: c.expectedWindowMinutes != null ? String(c.expectedWindowMinutes) : '10',
    }));
}

/**
 * Master Ronde : le superviseur choisit un site (déjà configuré par l'administrateur). Les points du site
 * ET leurs horaires de passage (s'ils ont été définis par l'administrateur) sont repris automatiquement ;
 * il peut les modifier, retirer ou réordonner.
 */
export default function MasterRondePage() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi<{ items: PatrolRoute[] }>('/routes', { active: true });
  const { data: sites } = useApi<{ items: Site[] }>('/sites', { active: true });
  const [open, setOpen] = useState<null | 'new' | PatrolRoute>(null);
  const [form, setForm] = useState(empty);
  const [siteCps, setSiteCps] = useState<Checkpoint[]>([]);
  const [templates, setTemplates] = useState<PatrolRoute[]>([]);
  const [template, setTemplate] = useState(''); // id d'un parcours existant, ou '' = tous les points du site
  const [busy, setBusy] = useState(false);

  async function loadSite(id: string, preselect: boolean) {
    if (!id) {
      setSiteCps([]);
      setTemplates([]);
      return;
    }
    try {
      const [cps, rts] = await Promise.all([
        api<{ items: Checkpoint[] }>('/checkpoints', { query: { site: id, active: true } }),
        api<{ items: PatrolRoute[] }>('/routes', { query: { site: id, active: true } }),
      ]);
      setSiteCps(cps.items);
      setTemplates(rts.items);
      if (preselect) {
        const first = rts.items[0];
        if (first) {
          setTemplate(first.id);
          setForm((f) => ({
            ...f,
            points: pointsFromRoute(first),
            startTime: first.startTime || f.startTime,
            duration: String(first.expectedDurationMinutes || 30),
            strictOrder: first.strictOrder,
          }));
        } else {
          setTemplate('');
          setForm((f) => ({ ...f, points: cps.items.map((c) => ({ id: c.id, offset: '', window: '10' })) }));
        }
      }
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  function applyTemplate(id: string) {
    setTemplate(id);
    const r = templates.find((t) => t.id === id);
    if (r) {
      setForm((f) => ({ ...f, points: pointsFromRoute(r), startTime: r.startTime || f.startTime, duration: String(r.expectedDurationMinutes || 30), strictOrder: r.strictOrder }));
    } else {
      setForm((f) => ({ ...f, points: siteCps.map((c) => ({ id: c.id, offset: '', window: '10' })) }));
    }
  }

  function edit(r: 'new' | PatrolRoute) {
    setOpen(r);
    setTemplate('');
    if (r === 'new') {
      const only = sites?.items.length === 1 ? sites.items[0].id : '';
      setForm({ ...empty, site: only });
      setSiteCps([]);
      setTemplates([]);
      if (only) loadSite(only, true);
    } else {
      const sid = siteId(r.site);
      setForm({
        site: sid,
        name: r.name,
        startTime: r.startTime || '',
        duration: String(r.expectedDurationMinutes || 30),
        points: pointsFromRoute(r),
        strictOrder: r.strictOrder,
      });
      loadSite(sid, false);
    }
  }

  const cpById = (id: string) => siteCps.find((c) => c.id === id);
  const setPoint = (i: number, patch: Partial<Point>) => setForm((f) => ({ ...f, points: f.points.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));
  const move = (i: number, d: -1 | 1) =>
    setForm((f) => {
      const j = i + d;
      if (j < 0 || j >= f.points.length) return f;
      const p = [...f.points];
      [p[i], p[j]] = [p[j], p[i]];
      return { ...f, points: p };
    });

  // Répartit les points régulièrement sur la durée prévue de la ronde
  function spread() {
    const n = form.points.length;
    const dur = Math.max(Number(form.duration) || 30, n);
    const step = Math.max(Math.floor(dur / n), 1);
    setForm((f) => ({ ...f, points: f.points.map((p, i) => ({ ...p, offset: String(i * step), window: String(Math.max(step, 5)) })) }));
  }

  async function save() {
    setBusy(true);
    const body = {
      name: form.name,
      startTime: form.startTime || null,
      expectedDurationMinutes: Number(form.duration) || 30,
      strictOrder: form.strictOrder,
      checkpoints: form.points.map((p) => ({
        checkpoint: p.id,
        expectedOffsetMinutes: p.offset === '' ? null : Number(p.offset),
        expectedWindowMinutes: p.offset === '' ? null : Math.max(Number(p.window) || 10, 1),
      })),
    };
    try {
      if (open === 'new') await api('/routes', { body: { ...body, site: form.site } });
      else if (open) await api(`/routes/${open.id}`, { method: 'PATCH', body });
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

  const used = new Set(form.points.map((p) => p.id));
  const missing = siteCps.filter((c) => !used.has(c.id));
  const hasStart = /^\d{1,2}:\d{2}$/.test(form.startTime);

  return (
    <>
      <PageHeader
        title="Master Ronde"
        subtitle="Créez vos rondes : un site, une heure de départ, et les points à contrôler avec leur heure de passage."
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
        wide
        title={open === 'new' ? 'Nouvelle ronde' : 'Modifier la ronde'}
        footer={
          <Button loading={busy} disabled={!form.site || !form.name || !form.points.length} onClick={save}>
            Enregistrer
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Site *" hint={open === 'new' ? 'Les points et horaires du site sont repris automatiquement' : 'Le site ne peut plus être changé'}>
              <Select
                value={form.site}
                disabled={open !== 'new'}
                onChange={(e) => {
                  setForm({ ...form, site: e.target.value, points: [] });
                  loadSite(e.target.value, true);
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
            {open === 'new' && templates.length > 0 && (
              <Field label="Partir de" hint="Modèle défini par l’administrateur pour ce site">
                <Select value={template} onChange={(e) => applyTemplate(e.target.value)}>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                  <option value="">Tous les points du site (sans horaire)</option>
                </Select>
              </Field>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Nom de la ronde *">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex. Ronde de nuit" />
            </Field>
            <Field label="Heure de départ">
              <Input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
            </Field>
            <Field label="Durée prévue (min)">
              <Input type="number" min={1} value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} />
            </Field>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-steel-2">Points à contrôler, dans l’ordre de passage, avec l’heure de passage</p>
              {form.points.length > 0 && (
                <Button size="sm" variant="ghost" onClick={spread} disabled={!hasStart} title="Répartir les points régulièrement sur la durée prévue">
                  <Wand2 className="h-3.5 w-3.5" /> Répartir automatiquement
                </Button>
              )}
            </div>
            {!form.site ? (
              <p className="rounded-lg border border-dashed border-line p-3 text-sm text-steel">Choisissez d’abord un site.</p>
            ) : (
              <>
                {!form.points.length && <p className="rounded-lg border border-dashed border-line p-3 text-sm text-steel">Aucun point sélectionné.</p>}
                <ol className="space-y-1.5">
                  {form.points.map((p, i) => {
                    const cp = cpById(p.id);
                    const clock = hasStart && p.offset !== '' ? toHHMM(toMin(form.startTime) + Number(p.offset)) : '';
                    return (
                      <li key={p.id} className="rounded-lg border border-line bg-ink px-3 py-2 text-sm">
                        <div className="flex items-center gap-2">
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
                            onClick={() => setForm((f) => ({ ...f, points: f.points.filter((x) => x.id !== p.id) }))}
                            aria-label="Retirer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-7 text-[11px] text-steel">
                          <span>Passage à</span>
                          {hasStart ? (
                            <input
                              type="time"
                              value={clock}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (!v) return setPoint(i, { offset: '' });
                                setPoint(i, { offset: String((toMin(v) - toMin(form.startTime) + 1440) % 1440) });
                              }}
                              className="rounded border border-line bg-panel px-1.5 py-0.5 text-white"
                            />
                          ) : (
                            <input
                              type="number"
                              min={0}
                              value={p.offset}
                              placeholder="—"
                              onChange={(e) => setPoint(i, { offset: e.target.value })}
                              className="w-16 rounded border border-line bg-panel px-1.5 py-0.5 text-white"
                            />
                          )}
                          {!hasStart && <span>min après le départ</span>}
                          <span>· tolérance</span>
                          <input
                            type="number"
                            min={1}
                            value={p.window}
                            disabled={p.offset === ''}
                            onChange={(e) => setPoint(i, { window: e.target.value })}
                            className="w-16 rounded border border-line bg-panel px-1.5 py-0.5 text-white disabled:opacity-40"
                          />
                          <span>min</span>
                          {p.offset === '' && <span className="text-zinc-600">(pas d’horaire imposé)</span>}
                        </div>
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
                        onClick={() => setForm((f) => ({ ...f, points: [...f.points, { id: c.id, offset: '', window: '10' }] }))}
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
