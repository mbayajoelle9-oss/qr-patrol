'use client';

import { useEffect, useState } from 'react';
import { Mail, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import type { Organization, OrgSettings } from '@/lib/types';
import { Button, Card, Checkbox, ErrorBox, Field, Input, Loading, PageHeader, useToast } from '@/components/ui';

const NUMERIC: { key: keyof OrgSettings; label: string; hint: string; unit: string }[] = [
  { key: 'defaultCheckpointRadius', label: 'Rayon de tolérance par défaut', hint: 'Distance max entre l’agent et le point au moment du scan', unit: 'm' },
  { key: 'maxGpsAccuracy', label: 'Précision GPS minimale', hint: 'Au-delà, le scan est signalé « précision insuffisante »', unit: 'm' },
  { key: 'duplicateScanMinutes', label: 'Fenêtre anti-doublon', hint: 'Deux scans du même point dans cet intervalle = doublon', unit: 'min' },
  { key: 'maxWalkingSpeed', label: 'Vitesse max entre deux points', hint: 'Détecte les « téléportations » (QR photographiés)', unit: 'm/s' },
  { key: 'maxClockSkewMinutes', label: 'Décalage d’horloge toléré', hint: 'Écart max entre l’heure du téléphone et du serveur', unit: 'min' },
  { key: 'offlineScanMaxHours', label: 'Délai max de synchronisation hors-ligne', hint: 'Les scans plus anciens sont signalés', unit: 'h' },
  { key: 'lateToleranceMinutes', label: 'Tolérance de retard', hint: 'Après ce délai, la ronde non démarrée est signalée en retard', unit: 'min' },
  { key: 'positionPingSeconds', label: 'Fréquence d’envoi de la position', hint: 'Pendant le service de l’agent', unit: 's' },
];

export default function SettingsPage() {
  const toast = useToast();
  const { refresh } = useAuth();
  const { data, loading, error } = useApi<{ organization: Organization }>('/organizations/current');
  const [org, setOrg] = useState<Organization | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) setOrg(data.organization);
  }, [data]);

  async function save() {
    if (!org) return;
    setBusy(true);
    try {
      await api('/organizations/current', {
        method: 'PATCH',
        body: {
          name: org.name,
          contactEmail: org.contactEmail || '',
          contactPhone: org.contactPhone || undefined,
          address: org.address || undefined,
          primaryColor: org.primaryColor || undefined,
          settings: org.settings,
        },
      });
      toast('Paramètres enregistrés');
      refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (loading && !org) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  if (!org) return null;
  const setS = (k: keyof OrgSettings, v: number | boolean) => setOrg({ ...org, settings: { ...org.settings, [k]: v } });

  return (
    <>
      <PageHeader
        title="Paramètres"
        subtitle={`Société ${org.name} · code ${org.code}`}
        actions={
          <Button loading={busy} onClick={save}>
            Enregistrer
          </Button>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
        <Card title="Société">
          <div className="space-y-3 p-4">
            <Field label="Nom">
              <Input value={org.name} onChange={(e) => setOrg({ ...org, name: e.target.value })} />
            </Field>
            <Field label="E-mail de contact">
              <Input value={org.contactEmail || ''} onChange={(e) => setOrg({ ...org, contactEmail: e.target.value })} />
            </Field>
            <Field label="Téléphone">
              <Input value={org.contactPhone || ''} onChange={(e) => setOrg({ ...org, contactPhone: e.target.value })} />
            </Field>
            <Field label="Adresse">
              <Input value={org.address || ''} onChange={(e) => setOrg({ ...org, address: e.target.value })} />
            </Field>
            <Field label="Couleur principale (étiquettes QR, rapports)">
              <div className="flex gap-2">
                <input type="color" value={org.primaryColor || '#e92026'} onChange={(e) => setOrg({ ...org, primaryColor: e.target.value })} className="h-10 w-14 rounded border border-line bg-ink" />
                <Input value={org.primaryColor || ''} onChange={(e) => setOrg({ ...org, primaryColor: e.target.value })} />
              </div>
            </Field>
          </div>
        </Card>

        <Card
          title={
            <span className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-brand" /> Contrôle anti-fraude & rondes
            </span>
          }
        >
          <div className="grid gap-4 p-4 md:grid-cols-2">
            {NUMERIC.map((n) => (
              <Field key={n.key} label={`${n.label} (${n.unit})`} hint={n.hint}>
                <Input type="number" value={org.settings[n.key] as number} onChange={(e) => setS(n.key, Number(e.target.value))} />
              </Field>
            ))}
          </div>
          <div className="grid gap-3 border-t border-line p-4 md:grid-cols-2">
            <Checkbox
              label="Lier chaque agent à un seul téléphone"
              checked={org.settings.enforceDeviceBinding}
              onChange={(e) => setS('enforceDeviceBinding', e.target.checked)}
            />
            <Checkbox label="Rejeter les positions GPS simulées" checked={org.settings.rejectMockLocation} onChange={(e) => setS('rejectMockLocation', e.target.checked)} />
            <Checkbox
              label="Exiger la vérification biométrique (empreinte/visage) à chaque scan"
              checked={org.settings.requireBiometricScan}
              onChange={(e) => setS('requireBiometricScan', e.target.checked)}
            />
            <Checkbox label="Alerter la centrale sur scan suspect" checked={org.settings.alertOnSuspiciousScan} onChange={(e) => setS('alertOnSuspiciousScan', e.target.checked)} />
            <Checkbox label="Alerter la centrale sur ronde en retard" checked={org.settings.alertOnLatePatrol} onChange={(e) => setS('alertOnLatePatrol', e.target.checked)} />
          </div>
        </Card>

        <Card
          title={
            <span className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-brand" /> Configuration du système avec Outlook
            </span>
          }
          className="xl:col-span-2"
        >
          <div className="space-y-3 p-4">
            <p className="text-xs text-steel">
              Synchronise le planning hebdomadaire vers les calendriers Outlook des rondiers et/ou envoie les notifications par e-mail via Microsoft
              365. Nécessite une inscription d’application dans le portail Azure Active Directory de la société (tenant, identifiant client, secret
              client) — à demander à votre service informatique.
            </p>
            <Checkbox label="Activer l’intégration Outlook" checked={org.settings.outlookEnabled} onChange={(e) => setS('outlookEnabled', e.target.checked)} />
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="ID de locataire (Tenant ID)">
                <Input value={org.settings.outlookTenantId || ''} onChange={(e) => setOrg({ ...org, settings: { ...org.settings, outlookTenantId: e.target.value } })} />
              </Field>
              <Field label="ID client (Client ID)">
                <Input value={org.settings.outlookClientId || ''} onChange={(e) => setOrg({ ...org, settings: { ...org.settings, outlookClientId: e.target.value } })} />
              </Field>
              <Field label="Secret client">
                <Input
                  type="password"
                  value={org.settings.outlookClientSecret || ''}
                  onChange={(e) => setOrg({ ...org, settings: { ...org.settings, outlookClientSecret: e.target.value } })}
                />
              </Field>
              <Field label="Boîte mail / calendrier partagé" hint="Ex. planning@fameco.cd">
                <Input value={org.settings.outlookMailbox || ''} onChange={(e) => setOrg({ ...org, settings: { ...org.settings, outlookMailbox: e.target.value } })} />
              </Field>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
