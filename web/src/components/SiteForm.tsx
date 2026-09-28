'use client';

import MapView from '@/components/MapView';
import { Field, Input, Textarea } from '@/components/ui';

export const emptySite = { name: '', code: '', client: '', address: '', city: 'Kinshasa', lat: '', lng: '', geofenceRadius: 300, contactName: '', contactPhone: '', instructions: '' };
export type SiteForm = typeof emptySite;

export function SiteFormFields({ form, setForm }: { form: SiteForm; setForm: (f: SiteForm) => void }) {
  const set = (k: keyof SiteForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  const lat = parseFloat(form.lat);
  const lng = parseFloat(form.lng);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-3">
        <Field label="Nom du site *">
          <Input value={form.name} onChange={set('name')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Code">
            <Input value={form.code} onChange={set('code')} placeholder="SIEGE" />
          </Field>
          <Field label="Client protégé">
            <Input value={form.client} onChange={set('client')} />
          </Field>
        </div>
        <Field label="Adresse">
          <Input value={form.address} onChange={set('address')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Contact sur site">
            <Input value={form.contactName} onChange={set('contactName')} />
          </Field>
          <Field label="Téléphone">
            <Input value={form.contactPhone} onChange={set('contactPhone')} />
          </Field>
        </div>
        <Field label="Consignes générales du poste">
          <Textarea value={form.instructions} onChange={set('instructions')} />
        </Field>
      </div>
      <div className="space-y-3">
        <p className="text-xs text-steel">Cliquez sur la carte pour placer le centre du site.</p>
        <div className="h-64 overflow-hidden rounded-lg border border-line">
          <MapView
            onPick={(la, ln) => setForm({ ...form, lat: la.toFixed(6), lng: ln.toFixed(6) })}
            markers={!Number.isNaN(lat) && !Number.isNaN(lng) ? [{ id: 'p', lat, lng, kind: 'site', radius: Number(form.geofenceRadius) }] : []}
            fitKey={form.lat && form.lng ? 'set' : 'none'}
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Latitude">
            <Input value={form.lat} onChange={set('lat')} />
          </Field>
          <Field label="Longitude">
            <Input value={form.lng} onChange={set('lng')} />
          </Field>
          <Field label="Rayon (m)">
            <Input type="number" value={form.geofenceRadius} onChange={(e) => setForm({ ...form, geofenceRadius: Number(e.target.value) })} />
          </Field>
        </div>
      </div>
    </div>
  );
}

export function siteFormToBody(f: SiteForm) {
  return {
    name: f.name,
    code: f.code || undefined,
    client: f.client || undefined,
    address: f.address || undefined,
    city: f.city || undefined,
    lat: f.lat ? Number(f.lat) : null,
    lng: f.lng ? Number(f.lng) : null,
    geofenceRadius: Number(f.geofenceRadius) || 300,
    contactName: f.contactName || undefined,
    contactPhone: f.contactPhone || undefined,
    instructions: f.instructions || undefined,
  };
}

