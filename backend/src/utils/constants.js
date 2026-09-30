const ROLES = {
  SUPER_ADMIN: 'super_admin', // plateforme (ROOKSECURITY)
  ADMIN: 'admin', // administrateur de la société cliente
  SUPERVISOR: 'supervisor', // opérateur de la centrale
  AGENT: 'agent', // agent de sécurité (app mobile)
  RESPONDER: 'responder', // membre d'une équipe d'intervention
};
const ALL_ROLES = Object.values(ROLES);
const STAFF_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.SUPERVISOR];
const ADMIN_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN];

const PATROL_STATUS = {
  SCHEDULED: 'scheduled',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  INCOMPLETE: 'incomplete', // terminée mais des points manquent
  MISSED: 'missed', // jamais démarrée dans la fenêtre
  CANCELLED: 'cancelled',
};

const SCAN_STATUS = { VALID: 'valid', SUSPICIOUS: 'suspicious', REJECTED: 'rejected' };

// Codes d'anomalie détectés par le contrôle anti-fraude
const SCAN_FLAGS = {
  GPS_MISSING: 'GPS_MISSING',
  GPS_TOO_FAR: 'GPS_TOO_FAR',
  LOW_ACCURACY: 'LOW_ACCURACY',
  MOCK_LOCATION: 'MOCK_LOCATION',
  DUPLICATE: 'DUPLICATE',
  IMPOSSIBLE_SPEED: 'IMPOSSIBLE_SPEED',
  UNKNOWN_DEVICE: 'UNKNOWN_DEVICE',
  CLOCK_SKEW: 'CLOCK_SKEW',
  OUT_OF_ORDER: 'OUT_OF_ORDER',
  NOT_IN_ROUTE: 'NOT_IN_ROUTE',
  OUTSIDE_WINDOW: 'OUTSIDE_WINDOW',
  WRONG_SITE: 'WRONG_SITE',
  UNASSIGNED_SITE: 'UNASSIGNED_SITE',
  REVOKED_QR: 'REVOKED_QR',
  INVALID_QR: 'INVALID_QR',
  CHECKPOINT_INACTIVE: 'CHECKPOINT_INACTIVE',
  BIOMETRIC_MISSING: 'BIOMETRIC_MISSING',
  OUTSIDE_CHECKPOINT_WINDOW: 'OUTSIDE_CHECKPOINT_WINDOW',
};

const FLAG_LABELS = {
  GPS_MISSING: 'Position GPS absente',
  GPS_TOO_FAR: 'Agent trop éloigné du point',
  LOW_ACCURACY: 'Précision GPS insuffisante',
  MOCK_LOCATION: 'Position GPS simulée',
  DUPLICATE: 'Scan en double',
  IMPOSSIBLE_SPEED: 'Déplacement impossible entre deux points',
  UNKNOWN_DEVICE: 'Téléphone non reconnu',
  CLOCK_SKEW: "Heure du téléphone incohérente",
  OUT_OF_ORDER: 'Point scanné hors ordre',
  NOT_IN_ROUTE: 'Point absent de la ronde',
  OUTSIDE_WINDOW: 'Scan hors de la fenêtre horaire',
  WRONG_SITE: 'Point d’un autre site que la ronde',
  UNASSIGNED_SITE: 'Agent non affecté à ce site',
  REVOKED_QR: 'QR Code révoqué',
  INVALID_QR: 'QR Code invalide',
  CHECKPOINT_INACTIVE: 'Point de contrôle désactivé',
  BIOMETRIC_MISSING: 'Vérification biométrique manquante',
  OUTSIDE_CHECKPOINT_WINDOW: 'Passage hors du créneau horaire attendu pour ce point',
};

// Anomalies qui entraînent un rejet pur et simple du scan
const REJECTING_FLAGS = [
  SCAN_FLAGS.INVALID_QR,
  SCAN_FLAGS.REVOKED_QR,
  SCAN_FLAGS.WRONG_SITE,
  SCAN_FLAGS.CHECKPOINT_INACTIVE,
];

const INCIDENT_TYPES = [
  'sos',
  'intrusion',
  'porte_forcee',
  'vol',
  'incendie',
  'agression',
  'degradation',
  'colis_suspect',
  'panne_equipement',
  'eclairage',
  'acces_non_autorise',
  'medical',
  'autre',
];

const INCIDENT_TYPE_LABELS = {
  sos: 'SOS / Urgence agent',
  intrusion: 'Intrusion',
  porte_forcee: 'Porte forcée',
  vol: 'Vol',
  incendie: 'Incendie / Fumée',
  agression: 'Agression',
  degradation: 'Dégradation',
  colis_suspect: 'Colis suspect',
  panne_equipement: 'Panne d’équipement',
  eclairage: 'Éclairage défaillant',
  acces_non_autorise: 'Accès non autorisé',
  medical: 'Urgence médicale',
  autre: 'Autre',
};

const SEVERITIES = ['low', 'medium', 'high', 'critical'];
const SEVERITY_LABELS = { low: 'Faible', medium: 'Moyenne', high: 'Élevée', critical: 'Critique' };

const INCIDENT_STATUS = {
  DECLARED: 'declared',
  ACKNOWLEDGED: 'acknowledged',
  DISPATCHED: 'dispatched',
  ON_SITE: 'on_site',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
  CANCELLED: 'cancelled',
};

// Transitions autorisées du workflow incident
const INCIDENT_TRANSITIONS = {
  declared: ['acknowledged', 'dispatched', 'resolved', 'cancelled'],
  acknowledged: ['dispatched', 'resolved', 'cancelled'],
  dispatched: ['on_site', 'resolved', 'cancelled'],
  on_site: ['resolved'],
  resolved: ['closed', 'acknowledged'],
  closed: [],
  cancelled: [],
};

const INCIDENT_STATUS_LABELS = {
  declared: 'Déclaré',
  acknowledged: 'Pris en charge',
  dispatched: 'Équipe envoyée',
  on_site: 'Équipe sur place',
  resolved: 'Résolu',
  closed: 'Clôturé',
  cancelled: 'Annulé',
};

const INTERVENTION_STATUS = ['dispatched', 'en_route', 'on_site', 'completed', 'cancelled'];

module.exports = {
  ROLES,
  ALL_ROLES,
  STAFF_ROLES,
  ADMIN_ROLES,
  PATROL_STATUS,
  SCAN_STATUS,
  SCAN_FLAGS,
  FLAG_LABELS,
  REJECTING_FLAGS,
  INCIDENT_TYPES,
  INCIDENT_TYPE_LABELS,
  SEVERITIES,
  SEVERITY_LABELS,
  INCIDENT_STATUS,
  INCIDENT_TRANSITIONS,
  INCIDENT_STATUS_LABELS,
  INTERVENTION_STATUS,
};
