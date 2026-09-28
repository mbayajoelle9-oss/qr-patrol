'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MapPin, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { toLatLng } from '@/lib/format';
import type { Site } from '@/lib/types';
import { Badge, Button, Card, Empty, ErrorBox, Loading, Modal, PageHeader, useToast } from '@/components/ui';
import { emptySite, SiteFormFields, siteFormToBody, type SiteForm } from '@/components/SiteForm';

export default function SitesPage() {
  const toast = useToast();
  const { isAdmin } = useAuth();
  const { data, loading, error, reload } = useApi<{ items: Site[] }>('/sites');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<SiteForm>(emptySite);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      await api('/sites', { body: siteFormToBody(form) });
      toast('Site créé');
      setOpen(false);
      setForm(emptySite);
      reload(true);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Sites & points de contrôle"
        subtitle="Chaque site est découpé en points de contrôle stratégiques, chacun avec son QR Code unique"
        actions={
          isAdmin && (
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> Nouveau site
            </Button>
          )
        }
      />
      <ErrorBox error={error} />
      {loading && !data ? (
        <Loading />
      ) : !data?.items.length ? (
        <Card>
          <Empty>Aucun site. Créez le premier site à sécuriser.</Empty>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.items.map((s) => (
            <Link key={s.id} href={`/admin/sites/${s.id}`} className="group rounded-xl border border-line bg-panel p-5 transition hover:border-brand/60">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-mono text-steel">{s.code || '—'}</p>
                  <h3 className="mt-0.5 text-lg font-semibold text-white group-hover:text-brand">{s.name}</h3>
                  <p className="mt-1 text-sm text-steel">{s.address || s.city}</p>
                </div>
                {!s.active && <Badge>Inactif</Badge>}
              </div>
              <div className="mt-4 flex items-center gap-4 text-sm text-steel-2">
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-brand" /> {s.checkpointsCount} point(s)
                </span>
                {!toLatLng(s.location) && <span className="text-xs text-amber-400">position à définir</span>}
              </div>
            </Link>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nouveau site"
        wide
        footer={
          <Button loading={busy} disabled={!form.name} onClick={create}>
            Créer le site
          </Button>
        }
      >
        <SiteFormFields form={form} setForm={setForm} />
      </Modal>
    </>
  );
}
