export const colors = {
  brand: '#E92026',
  brandDark: '#B3161B',
  bg: '#0B0B0C',
  panel: '#161618',
  panel2: '#1E1E21',
  line: '#2A2A2E',
  text: '#F4F4F5',
  muted: '#9CA3AF',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#E92026',
  info: '#38BDF8',
};

export const radius = { sm: 8, md: 12, lg: 16, xl: 22 };

export const SEVERITIES = [
  { value: 'low', label: 'Faible', color: '#71717A' },
  { value: 'medium', label: 'Moyenne', color: '#F59E0B' },
  { value: 'high', label: 'Élevée', color: '#F97316' },
  { value: 'critical', label: 'Critique', color: '#E92026' },
] as const;

export const INCIDENT_TYPES = [
  { value: 'intrusion', label: 'Intrusion', icon: '🚷' },
  { value: 'porte_forcee', label: 'Porte forcée', icon: '🚪' },
  { value: 'vol', label: 'Vol', icon: '💰' },
  { value: 'incendie', label: 'Incendie / Fumée', icon: '🔥' },
  { value: 'agression', label: 'Agression', icon: '⚠️' },
  { value: 'degradation', label: 'Dégradation', icon: '🔨' },
  { value: 'colis_suspect', label: 'Colis suspect', icon: '📦' },
  { value: 'acces_non_autorise', label: 'Accès non autorisé', icon: '🪪' },
  { value: 'panne_equipement', label: 'Panne d’équipement', icon: '🔧' },
  { value: 'eclairage', label: 'Éclairage défaillant', icon: '💡' },
  { value: 'medical', label: 'Urgence médicale', icon: '🚑' },
  { value: 'autre', label: 'Autre', icon: '📝' },
] as const;

export const INCIDENT_STATUS: Record<string, { label: string; color: string }> = {
  declared: { label: 'Déclaré', color: '#E92026' },
  acknowledged: { label: 'Pris en charge', color: '#F59E0B' },
  dispatched: { label: 'Équipe envoyée', color: '#38BDF8' },
  on_site: { label: 'Équipe sur place', color: '#38BDF8' },
  resolved: { label: 'Résolu', color: '#10B981' },
  closed: { label: 'Clôturé', color: '#71717A' },
  cancelled: { label: 'Annulé', color: '#71717A' },
};
