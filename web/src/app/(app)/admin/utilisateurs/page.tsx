'use client';

import { useRef, useState } from 'react';
import clsx from 'clsx';
import { Camera, KeyRound, Pencil, Plus, Smartphone } from 'lucide-react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { ROLE_LABELS, timeAgo } from '@/lib/format';
import type { Media, Role, Site, Team, User } from '@/lib/types';
import { Badge, Button, Card, Checkbox, Empty, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select, Table, Td, Th, useToast } from '@/components/ui';

const empty = {
  role: 'agent' as Role,
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  matricule: '',
  password: '',
  sites: [] as string[],
  team: '',
  active: true,
  photo: null as Media | null,
};

export default function UsersPage() {
  const toast = useToast();
  const { isAdmin, hasRole } = useAuth();
  const [role, setRole] = useState('');
  const [q, setQ] = useState('');
  const { data, loading, error, reload } = useApi<{ items: User[]; total: number }>('/users', { role: role || undefined, q: q || undefined });
  const { data: sites } = useApi<{ items: Site[] }>('/sites');
  const { data: teams } = useApi<{ items: Team[] }>('/teams');
  const [open, setOpen] = useState<null | 'new' | User>(null);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [secret, setSecret] = useState<{ name: string; password: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function edit(u: 'new' | User) {
    setOpen(u);
    if (u === 'new') setForm(empty);
    else
      setForm({
        role: u.role,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email || '',
        phone: u.phone || '',
        matricule: u.matricule || '',
        password: '',
        sites: (u.sites || []).map((s) => s.id),
        team: u.team?.id || '',
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
      role: form.role,
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      phone: form.phone || undefined,
      matricule: form.matricule || undefined,
      password: form.password || undefined,
      sites: form.sites,
      team: form.team || null,
      active: form.active,
      photo: form.photo?.id || null,
    };
    try {
      if (open === 'new') {
        const r = await api<{ user: User; tempPassword?: string }>('/users', { body });
        if (r.tempPassword) setSecret({ name: `${r.user.firstName} ${r.user.lastName}`, password: r.tempPassword });
        toast('Utilisateur créé');
      } else if (open) {
        await api(`/users/${open.id}`, { method: 'PATCH', body });
        toast('Utilisateur mis à jour');
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
    if (!confirm(`Réinitialiser le mot de passe de ${u.firstName} ${u.lastName} ?`)) return;
    const r = await api<{ tempPassword: string }>(`/users/${u.id}/reset-password`, { body: {} });
    setSecret({ name: `${u.firstName} ${u.lastName}`, password: r.tempPassword });
  }

  async function unbind(u: User) {
    if (!confirm(`Autoriser ${u.firstName} à se connecter depuis un nouveau téléphone ? L’ancien sera déconnecté.`)) return;
    await api(`/users/${u.id}/unbind-device`, { body: {} });
    toast('Téléphone délié — le prochain téléphone utilisé sera enregistré');
    reload(true);
  }

  return (
    <>
      <PageHeader
        title="Rondiers & utilisateurs"
        subtitle="Rondiers de terrain, opérateurs de la centrale, intervenants et administrateurs"
        actions={
          isAdmin && (
            <Button onClick={() => edit('new')}>
              <Plus className="h-4 w-4" /> Nouvel utilisateur
            </Button>
          )
        }
      />
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-line p-3">
          <Input placeholder="Rechercher (nom, matricule, e-mail)…" value={q} onChange={(e) => setQ(e.target.value)} className="!w-72" />
          <Select value={role} onChange={(e) => setRole(e.target.value)} className="!w-52">
            <option value="">Tous les rôles</option>
            {(['agent', 'responder', 'supervisor', 'admin'] as Role[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </div>
        <ErrorBox error={error} />
        {loading && !data ? (
          <Loading />
        ) : !data?.items.length ? (
          <Empty>Aucun utilisateur.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th />
                <Th>Nom</Th>
                <Th>Rôle</Th>
                <Th>Identifiant</Th>
                <Th>Sites</Th>
                <Th>Téléphone lié</Th>
                <Th>Statut</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {data.items.map((u) => (
                <tr key={u.id} className={clsx(!u.active && 'opacity-40')}>
                  <Td>
                    {u.photo?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u.photo.url} alt="" className="h-8 w-8 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/15 text-[11px] font-bold text-brand">
                        {u.firstName[0]}
                        {u.lastName[0]}
                      </div>
                    )}
                  </Td>
                  <Td className="text-white">
                    <span className={clsx('mr-2 inline-block h-2 w-2 rounded-full', u.online ? 'bg-emerald-500' : 'bg-zinc-700')} />
                    {u.firstName} {u.lastName}
                    {u.team && <span className="ml-1 text-xs text-steel">· {u.team.name}</span>}
                  </Td>
                  <Td>{ROLE_LABELS[u.role]}</Td>
                  <Td className="font-mono text-xs">{u.matricule || u.email || u.phone}</Td>
                  <Td className="text-xs">{(u.sites || []).map((s) => s.name).join(', ') || '—'}</Td>
                  <Td className="text-xs">{u.boundDevice?.deviceId ? u.boundDevice.model || 'oui' : '—'}</Td>
                  <Td>
                    {!u.active ? (
                      <Badge>Désactivé</Badge>
                    ) : u.onDuty ? (
                      <Badge tone="success">En service</Badge>
                    ) : (
                      <span className="text-xs text-steel">{u.lastSeenAt ? `vu ${timeAgo(u.lastSeenAt)}` : '—'}</span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-right">
                    {u.boundDevice?.deviceId && hasRole('admin', 'super_admin', 'supervisor') && (
                      <Button size="sm" variant="ghost" title="Délier le téléphone" onClick={() => unbind(u)}>
                        <Smartphone className="h-4 w-4" />
                      </Button>
                    )}
                    {isAdmin && (
                      <>
                        <Button size="sm" variant="ghost" title="Réinitialiser le mot de passe" onClick={() => resetPassword(u)}>
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" title="Modifier" onClick={() => edit(u)}>
                          <Pencil className="h-4 w-4" />
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

      <Modal
        open={!!open}
        onClose={() => setOpen(null)}
        title={open === 'new' ? 'Nouvel utilisateur' : 'Modifier l’utilisateur'}
        footer={
          <Button loading={busy} disabled={!form.firstName || !form.lastName} onClick={save}>
            Enregistrer
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              {form.photo?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.photo.url} alt="" className="h-16 w-16 rounded-full object-cover" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand/15 text-lg font-bold text-brand">
                  {(form.firstName[0] || '?') + (form.lastName[0] || '')}
                </div>
              )}
            </div>
            <div>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => uploadPhoto(e.target.files?.[0])}
              />
              <Button size="sm" variant="ghost" loading={uploadingPhoto} onClick={() => fileInput.current?.click()}>
                <Camera className="h-4 w-4" /> {form.photo ? 'Changer la photo' : 'Ajouter une photo'}
              </Button>
              <p className="mt-1 text-xs text-steel">Photo du rondier — visible sur son profil et sa fiche.</p>
            </div>
          </div>
          <Field label="Rôle">
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              {(['agent', 'responder', 'supervisor', 'admin'] as Role[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prénom *">
              <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </Field>
            <Field label="Nom *">
              <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Matricule" hint="Identifiant de connexion des agents">
              <Input value={form.matricule} onChange={(e) => setForm({ ...form, matricule: e.target.value })} />
            </Field>
            <Field label="Téléphone">
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
          </div>
          <Field label="E-mail" hint={['admin', 'supervisor'].includes(form.role) ? 'Requis pour la connexion web' : undefined}>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label={open === 'new' ? 'Mot de passe' : 'Nouveau mot de passe'} hint={open === 'new' ? 'Vide = code à 6 chiffres généré' : 'Laisser vide pour ne pas changer'}>
            <Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
          {['agent', 'responder'].includes(form.role) && (
            <>
              <div>
                <p className="mb-2 text-xs font-medium text-steel-2">Sites affectés</p>
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
              <Field label="Équipe">
                <Select value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })}>
                  <option value="">—</option>
                  {teams?.items.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          )}
          {open !== 'new' && <Checkbox label="Compte actif" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />}
        </div>
      </Modal>

      <Modal open={!!secret} onClose={() => setSecret(null)} title="Mot de passe temporaire">
        {secret && (
          <div className="space-y-3 text-center">
            <p className="text-sm text-steel">Communiquez ce code à {secret.name}. Il ne sera plus affiché.</p>
            <p className="font-mono text-4xl font-bold tracking-[0.3em] text-white">{secret.password}</p>
          </div>
        )}
      </Modal>
    </>
  );
}
