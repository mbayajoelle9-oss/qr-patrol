import type { GeoPoint, IncidentStatus, PatrolStatus, Role, Severity } from './types';

const TZ = 'Africa/Kinshasa';

export function fmtDateTime(d?: string | Date | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('fr-FR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' });
}
export function fmtTime(d?: string | Date | null, withSeconds = false) {
  if (!d) return '—';
  return new Date(d).toLocaleTimeString('fr-FR', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
  });
}
export function fmtDate(d?: string | Date | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' });
}
export function timeAgo(d?: string | Date | null) {
  if (!d) return '—';
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `il y a ${Math.floor(s / 86400)} j`;
}
export function durationMin(from?: string, to?: string) {
  if (!from) return '—';
  const m = Math.round(((to ? new Date(to).getTime() : Date.now()) - new Date(from).getTime()) / 60000);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

export const toLatLng = (p?: GeoPoint | null): [number, number] | null =>
  p?.coordinates?.length === 2 ? [p.coordinates[1], p.coordinates[0]] : null;

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Super admin',
  admin: 'Administrateur',
  supervisor: 'Opérateur centrale',
  agent: 'Agent',
  responder: 'Intervenant',
};

export const PATROL_STATUS: Record<PatrolStatus, { label: string; tone: Tone }> = {
  scheduled: { label: 'Planifiée', tone: 'neutral' },
  in_progress: { label: 'En cours', tone: 'info' },
  completed: { label: 'Complète', tone: 'success' },
  incomplete: { label: 'Incomplète', tone: 'warning' },
  missed: { label: 'Manquée', tone: 'danger' },
  cancelled: { label: 'Annulée', tone: 'neutral' },
};

export const SEVERITY: Record<Severity, { label: string; tone: Tone }> = {
  low: { label: 'Faible', tone: 'neutral' },
  medium: { label: 'Moyenne', tone: 'warning' },
  high: { label: 'Élevée', tone: 'danger' },
  critical: { label: 'Critique', tone: 'critical' },
};

export const INCIDENT_STATUS: Record<IncidentStatus, { label: string; tone: Tone }> = {
  declared: { label: 'Déclaré', tone: 'danger' },
  acknowledged: { label: 'Pris en charge', tone: 'warning' },
  dispatched: { label: 'Équipe envoyée', tone: 'info' },
  on_site: { label: 'Équipe sur place', tone: 'info' },
  resolved: { label: 'Résolu', tone: 'success' },
  closed: { label: 'Clôturé', tone: 'neutral' },
  cancelled: { label: 'Annulé', tone: 'neutral' },
};

export const INTERVENTION_STATUS: Record<string, { label: string; tone: Tone }> = {
  dispatched: { label: 'Envoyée', tone: 'warning' },
  en_route: { label: 'En route', tone: 'info' },
  on_site: { label: 'Sur place', tone: 'info' },
  completed: { label: 'Terminée', tone: 'success' },
  cancelled: { label: 'Annulée', tone: 'neutral' },
};

export const SCAN_STATUS: Record<string, { label: string; tone: Tone }> = {
  valid: { label: 'Validé', tone: 'success' },
  suspicious: { label: 'Suspect', tone: 'warning' },
  rejected: { label: 'Rejeté', tone: 'danger' },
};

export const DAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'critical';
