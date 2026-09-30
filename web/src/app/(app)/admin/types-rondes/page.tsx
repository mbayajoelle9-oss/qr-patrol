'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { Fingerprint, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import type { RoundType } from '@/lib/types';
import { Badge, Button, Card, Checkbox, Empty, ErrorBox, Field, Input, Loading, Modal, PageHeader, Textarea, useToast } from '@/components/ui';

const empty = { name: '', description: '', color: '#e92026', defaultDurationMinutes: '', requireBiometric: true, active: true };

export default function RoundTypesPage() {
  const toast = useToast();
  const { isAdmin } = useAuth();
  const { data, loading, error, reload } = useApi<{ items: RoundType[] }>('/round-types');
  const [open, setOpen] = useState<null | 'new' | RoundType>(null);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);

  function edit(rt: 'new' | RoundType) {
    setOpen(rt);
    if (rt === 'new') setForm(empty);
    else
      setForm({
        name: rt.name,
        description: rt.description || '',
        color: rt.color || '#e92026',
        defaultDurationMinutes: rt.defaultDurationMinutes ? String(rt.defaultDurationMinutes) : '',
        requireBiometric: rt.requireBiometric ?? true,
        active: rt.active,
      });
  }

  async function save() {
    setBusy(true);
    const body = {
      name: form.name,
      description: form.description || undefined,
      color: form.color || undefined,
      defaultDurationMinutes: form.defaultDurationMinutes ? Number(form.defaultDurationMinutes) : undefined,
      requireBiometric: form.requireBiometric,
      active: form.active,
    };
    try {
      if (open === 'new') await api('/round-types', { body });
      else if (open) await api(`/round-types/${open.id}`, { method: 'PATCH', body });
      toast('Type de ronde enregistré');
      setOpen(null);
      reload(true);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function remove(rt: RoundType) {
    if (!confirm(`Supprimer le type « ${rt.name} » ?`)) return;
    try {
      await api(`/round-types/${rt.id}`, { method: 'DELETE' });
      reload(true);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  return (
    <>
      <PageHeader
        title="Types de rondes"
        subtitle="Définissez les types de rondes (complète, express, technique…) utilisés dans les plannings et rondes ponctuelles"
        actions={
          isAdmin && (
            <Button onClick={() => edit('new')}>
              <Plus className="h-4 w-4" /> Nouveau type
            </Button>
          )
        }
      />
      <ErrorBox error={error} />
      {loading && !data ? (
        <Loading />
      ) : !data?.items.length ? (
        <Card>
          <Empty>Aucun type de ronde. Créez « Ronde complète » pour commencer.</Empty>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.items.map((rt) => (
            <Card key={rt.id} className={clsx(!rt.active && 'opacity-50')}>
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-lg"
                      style={{ backgroundColor: `${rt.color || '#e92026'}26`, color: rt.color || '#e92026' }}
                    >
                      <Fingerprint className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-white">{rt.name}</p>
                      {rt.defaultDurationMinutes && <p className="text-xs text-steel">≈ {rt.defaultDurationMinutes} min</p>}
                    </div>
                  </div>
                  {!rt.active && <Badge>Désactivé</Badge>}
                </div>
                {rt.description && <p className="mt-3 text-sm text-steel-2">{rt.description}</p>}
                {rt.requireBiometric && (
                  <p className="mt-2 text-xs text-brand">
                    <Fingerprint className="mr-1 inline h-3.5 w-3.5" /> Vérification biométrique exigée à chaque point
                  </p>
                )}
                {isAdmin && (
                  <div className="mt-3 flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => edit(rt)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(rt)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={!!open}
        onClose={() => setOpen(null)}
        title={open === 'new' ? 'Nouveau type de ronde' : 'Modifier le type de ronde'}
        footer={
          <Button loading={busy} disabled={!form.name} onClick={save}>
            Enregistrer
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="Nom *" hint="Ex. Ronde complète, Ronde express, Ronde technique">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Description">
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Couleur">
              <Input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="!h-10 !w-full !p-1" />
            </Field>
            <Field label="Durée type (min)">
              <Input
                type="number"
                min={1}
                value={form.defaultDurationMinutes}
                onChange={(e) => setForm({ ...form, defaultDurationMinutes: e.target.value })}
              />
            </Field>
          </div>
          <Checkbox
            label="Exiger la vérification biométrique à chaque point (empreinte / visage)"
            checked={form.requireBiometric}
            onChange={(e) => setForm({ ...form, requireBiometric: e.target.checked })}
          />
          {open !== 'new' && <Checkbox label="Type actif" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />}
        </div>
      </Modal>
    </>
  );
}
