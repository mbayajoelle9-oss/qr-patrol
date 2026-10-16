'use client';

import { useRef, useState } from 'react';
import clsx from 'clsx';
import { Camera, KeyRound, Pencil, Plus, Smartphone } from 'lucide-react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { timeAgo } from '@/lib/format';
import type { Media, Site, User } from '@/lib/types';
import { Badge, Button, Card, Checkbox, Empty, ErrorBox, Field, Input, Loading, Modal, PageHeader, useToast } from '@/components/ui';

const empty = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  matricule: '',
  password: '',
  sites: [] as string[],
  active: true,
  photo: null as Media | null,
};

/** Master Rondier : le superviseur crée et gère ses rondiers (jamais d'autre rôle). */
export default function MasterRondierPage() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const { data, loading, error, reload } = useApi<{ items: User[]; total: number }>('/users', { role: 'agent', q: q || undefined });
  const { data: sites } = useApi<{ items: Site[] }>('/sites', { active: true });
  const [open, setOpen] = useState<null | 'new' | User>(null);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [secret, setSecret] = useState<{ name: string; matricule?: string; password: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function edit(u: 'new' | User) {
    setOpen(u);
    if (u === 'new') {
      // Un seul site (cas FAMECO) : on le coche d'office
      const only = sites?.items.length === 1 ? [sites.items[0].id] : [];
      setForm({ ...empty, sites: only });
    } else
      setForm({
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email || '',
        phone: u.phone || '',
        matricule: u.matricule || '',
        password: '',
        sites: (u.sites || []).map((s) => s.id),
        active: u.active,
        photo: u.photo || null,
      });
  }

  async function uploadPhoto(file?: File | null) {
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('context', 'avatar');
      const r = await api<{ media: Media }>('/media', { body: fd });
      setForm((f) => ({ ...f, photo: r.media }));
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function save() {
    setBusy(true);
    const body = {
      role: 'agent',
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      phone: form.phone || undefined,
      matricule: form.matricule || undefined,
      password: form.password || undefined,
      sites: form.sites,
      active: form.active,
      photo: form.photo?.id || null,
    };
    try {
      if (open === 'new') {
        const r = await api<{ user: User; tempPassword?: string }>('/users', { body });
        if (r.tempPassword) setSecret({ name: `${r.user.firstName} ${r.user.lastName}`, matricule: r.user.matricule, password: r.tempPassword });
        toast('Rondier créé');
      } else if (open) {
        await api(`/users/${open.id}`, { method: 'PATCH', body });
        toast('Rondier mis à jour');
      }
      setOpen(null);
      reload(true);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(u: User) {
    if (!confirm(`Générer un nouveau code de connexion pour ${u.firstName} ${u.lastName} ?`)) return;
    try {
      const r = await api<{ tempPassword: string }>(`/users/${u.id}/reset-password`, { body: {} });
      setSecret({ name: `${u.firstName} ${u.lastName}`, matricule: u.matricule, password: r.tempPassword });
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  async function unbind(u: User) {
    if (!confirm(`Autoriser ${u.firstName} à se connecter depuis un nouveau téléphone ? L’ancien sera déconnecté.`)) return;
    try {
      await api(`/users/${u.id}/unbind-device`, { body: {} });
      toast('Téléphone délié — le prochain téléphone utilisé sera enregistré');
      reload(true);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  return (
    <>
      <PageHeader
        title="Master Rondier"
        subtitle="Créez vos rondiers une seule fois. Ils pourront ensuite être planifiés sur des rondes."
        actions={
          <Button onClick={() => edit('new')}>
            <Plus className="h-4 w-4" /> Nouveau rondier
          </Button>
        }
      />
      <Card>
        <div className="border-b border-line p-3">
          <Input placeholder="Rechercher un rondier (nom, matricule)…" value={q} onChange={(e) => setQ(e.target.value)} className="!w-80" />
        </div>
        <ErrorBox error={error} />
        {loading && !data ? (
          <Loading />
        ) : !data?.items.length ? (
          <Empty>Aucun rondier. Cliquez sur « Nouveau rondier » pour commencer.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {data.items.map((u) => (
              <li key={u.id} className={clsx('flex items-center gap-4 px-4 py-3', !u.active && 'opacity-40')}>
                {u.photo?.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={u.photo.url} alt="" className="h-11 w-11 rounded-full object-cover" />
                ) : (
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand/15 text-sm font-bold text-brand">
                    {u.firstName[0]}
                    {u.lastName[0]}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-white">
                    <span className={clsx('mr-2 inline-block h-2 w-2 rounded-full', u.online ? 'bg-emerald-500' : 'bg-zinc-700')} />
                    {u.firstName} {u.lastName}
                  </p>
                  <p className="text-xs text-steel">
                    Matricule <span className="font-mono text-steel-2">{u.matricule || '—'}</span>
                    {u.phone ? ` · ${u.phone}` : ''}
                    {u.sites?.length ? ` · ${u.sites.map((s) => s.name).join(', ')}` : ''}
                  </p>
                </div>
                <div className="hidden text-right text-xs sm:block">
                  {!u.active ? (
                    <Badge>Désactivé</Badge>
                  ) : u.onDuty ? (
                    <Badge tone="success">En service</Badge>
                  ) : (
                    <span className="text-steel">{u.lastSeenAt ? `vu ${timeAgo(u.lastSeenAt)}` : 'jamais connecté'}</span>
                  )}
                </div>
                <div className="flex gap-1">
                  {u.boundDevice?.deviceId && (
                    <Button size="sm" variant="ghost" title="Changer de téléphone" onClick={() => unbind(u)}>
                      <Smartphone className="h-4 w-4" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" title="Nouveau code de connexion" onClick={() => resetPassword(u)}>
                    <KeyRound className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" title="Modifier" onClick={() => edit(u)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={!!open}
        onClose={() => setOpen(null)}
        title={open === 'new' ? 'Nouveau rondier' : 'Modifier le rondier'}
        footer={
          <Button loading={busy} disabled={!form.firstName || !form.lastName || !form.matricule} onClick={save}>
            Enregistrer
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            {form.photo?.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.photo.url} alt="" className="h-16 w-16 rounded-full object-cover" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand/15 text-lg font-bold text-brand">
                {(form.firstName[0] || '?') + (form.lastName[0] || '')}
              </div>
            )}
            <div>
              <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(e) => uploadPhoto(e.target.files?.[0])} />
              <Button size="sm" variant="ghost" loading={uploadingPhoto} onClick={() => fileInput.current?.click()}>
                <Camera className="h-4 w-4" /> {form.photo ? 'Changer la photo' : 'Ajouter une photo'}
              </Button>
              <p className="mt-1 text-xs text-steel">Facultatif — visible sur la fiche du rondier.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prénom *">
              <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </Field>
            <Field label="Nom *">
              <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Matricule *" hint="C’est son identifiant pour se connecter sur l’application">
              <Input value={form.matricule} onChange={(e) => setForm({ ...form, matricule: e.target.value })} />
            </Field>
            <Field label="Téléphone">
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
          </div>
          <Field label="E-mail" hint="Facultatif">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field
            label={open === 'new' ? 'Code de connexion' : 'Nouveau code de connexion'}
            hint={open === 'new' ? 'Laissez vide : un code à 6 chiffres sera généré et affiché une seule fois' : 'Laissez vide pour ne pas changer'}
          >
            <Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
          <div>
            <p className="mb-2 text-xs font-medium text-steel-2">Site(s) où il travaille</p>
            <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-lg border border-line p-3">
              {sites?.items.map((s) => (
                <Checkbox
                  key={s.id}
                  label={s.name}
                  checked={form.sites.includes(s.id)}
                  onChange={(e) => setForm((f) => ({ ...f, sites: e.target.checked ? [...f.sites, s.id] : f.sites.filter((x) => x !== s.id) }))}
                />
              ))}
            </div>
          </div>
          {open !== 'new' && <Checkbox label="Compte actif" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />}
        </div>
      </Modal>

      <Modal open={!!secret} onClose={() => setSecret(null)} title="Code de connexion du rondier">
        {secret && (
          <div className="space-y-3 text-center">
            <p className="text-sm text-steel">
              Donnez ces identifiants à {secret.name}. Le code ne sera plus affiché ensuite.
            </p>
            {secret.matricule && (
              <p className="text-sm text-steel">
                Matricule : <span className="font-mono text-white">{secret.matricule}</span>
              </p>
            )}
            <p className="font-mono text-4xl font-bold tracking-[0.3em] text-white">{secret.password}</p>
          </div>
        )}
      </Modal>
    </>
  );
}
