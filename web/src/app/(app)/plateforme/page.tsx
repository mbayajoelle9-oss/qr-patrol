'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, LogIn, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import type { Organization } from '@/lib/types';
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Loading, Modal, PageHeader, Table, Td, Th, useToast } from '@/components/ui';

const empty = { name: '', code: '', contactEmail: '', contactPhone: '', address: '', adminFirstName: '', adminLastName: '', adminEmail: '', adminPassword: '' };

export default function PlatformPage() {
  const toast = useToast();
  const router = useRouter();
  const { isSuperAdmin, selectOrg, selectedOrgId } = useAuth();
  const { data, loading, error, reload } = useApi<{ items: Organization[] }>(isSuperAdmin ? '/organizations' : null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      await api('/organizations', {
        body: {
          name: form.name,
          code: form.code,
          contactEmail: form.contactEmail,
          contactPhone: form.contactPhone || undefined,
          address: form.address || undefined,
          admin: form.adminEmail
            ? { firstName: form.adminFirstName || 'Admin', lastName: form.adminLastName || form.name, email: form.adminEmail, password: form.adminPassword }
            : undefined,
        },
      });
      toast('Société créée');
      setOpen(false);
      setForm(empty);
      reload(true);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function toggle(o: Organization) {
    await api(`/organizations/${o.id}`, { method: 'PATCH', body: { active: !o.active } });
    reload(true);
  }

  if (!isSuperAdmin) return <ErrorBox error={new Error('Réservé au super administrateur')} />;

  return (
    <>
      <PageHeader
        title="Sociétés clientes"
        subtitle="Plateforme multi-sociétés : chaque client dispose de ses sites, agents et centrale isolés"
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Nouvelle société
          </Button>
        }
      />
      <Card>
        <ErrorBox error={error} />
        {loading && !data ? (
          <Loading />
        ) : !data?.items.length ? (
          <Empty>Aucune société.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Société</Th>
                <Th>Code</Th>
                <Th>Contact</Th>
                <Th>Utilisateurs</Th>
                <Th>Statut</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {data.items.map((o) => (
                <tr key={o.id}>
                  <Td className="text-white">
                    <Building2 className="mr-2 inline h-4 w-4 text-brand" />
                    {o.name}
                  </Td>
                  <Td className="font-mono text-xs">{o.code}</Td>
                  <Td className="text-xs">{[o.contactEmail, o.contactPhone].filter(Boolean).join(' · ')}</Td>
                  <Td>{o.usersCount}</Td>
                  <Td>
                    <button onClick={() => toggle(o)}>
                      <Badge tone={o.active ? 'success' : 'neutral'}>{o.active ? 'Active' : 'Suspendue'}</Badge>
                    </button>
                  </Td>
                  <Td className="text-right">
                    <Button
                      size="sm"
                      variant={selectedOrgId === o.id ? 'primary' : 'secondary'}
                      onClick={() => {
                        selectOrg(o.id);
                        setTimeout(() => router.push('/centrale'), 300);
                      }}
                    >
                      <LogIn className="h-3.5 w-3.5" /> {selectedOrgId === o.id ? 'Sélectionnée' : 'Superviser'}
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nouvelle société cliente"
        footer={
          <Button loading={busy} disabled={!form.name || !form.code} onClick={create}>
            Créer
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_140px] gap-3">
            <Field label="Nom *">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Code *">
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="E-mail">
              <Input value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
            </Field>
            <Field label="Téléphone">
              <Input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
            </Field>
          </div>
          <Field label="Adresse">
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </Field>
          <p className="border-t border-line pt-4 text-xs font-semibold uppercase tracking-wide text-steel">Administrateur de la société (facultatif)</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prénom">
              <Input value={form.adminFirstName} onChange={(e) => setForm({ ...form, adminFirstName: e.target.value })} />
            </Field>
            <Field label="Nom">
              <Input value={form.adminLastName} onChange={(e) => setForm({ ...form, adminLastName: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="E-mail">
              <Input value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} />
            </Field>
            <Field label="Mot de passe (8+)">
              <Input value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} />
            </Field>
          </div>
        </div>
      </Modal>
    </>
  );
}
