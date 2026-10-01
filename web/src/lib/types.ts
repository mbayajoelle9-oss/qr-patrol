export type Role = 'super_admin' | 'admin' | 'supervisor' | 'agent' | 'responder';

export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number]; // [lng, lat]
}

export interface CapturedLocation {
  lat: number;
  lng: number;
  accuracy?: number;
  mocked?: boolean;
  capturedAt?: string;
}

export interface OrgSettings {
  defaultCheckpointRadius: number;
  maxGpsAccuracy: number;
  duplicateScanMinutes: number;
  maxWalkingSpeed: number;
  maxClockSkewMinutes: number;
  offlineScanMaxHours: number;
  enforceDeviceBinding: boolean;
  rejectMockLocation: boolean;
  requireBiometricScan: boolean;
  lateToleranceMinutes: number;
  positionPingSeconds: number;
  alertOnSuspiciousScan: boolean;
  alertOnLatePatrol: boolean;
  outlookEnabled: boolean;
  outlookTenantId: string;
  outlookClientId: string;
  outlookClientSecret: string;
  outlookMailbox: string;
}

export interface Organization {
  id: string;
  _id?: string;
  name: string;
  code: string;
  logoUrl?: string;
  primaryColor?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  active?: boolean;
  settings: OrgSettings;
  usersCount?: number;
}

export interface Ref {
  id: string;
  _id?: string;
  name?: string;
  code?: string;
}

export interface User {
  id: string;
  role: Role;
  firstName: string;
  lastName: string;
  fullName?: string;
  email?: string;
  phone?: string;
  matricule?: string;
  active: boolean;
  sites?: Ref[];
  team?: Ref | null;
  onDuty?: boolean;
  dutyStartedAt?: string;
  lastPosition?: CapturedLocation;
  lastSeenAt?: string;
  lastLoginAt?: string;
  online?: boolean;
  boundDevice?: { deviceId: string; model?: string; os?: string; osVersion?: string };
  organization?: Organization | string | null;
  photo?: Media | null;
}

export interface RoundType {
  id: string;
  name: string;
  description?: string;
  color?: string;
  defaultDurationMinutes?: number;
  requireBiometric?: boolean;
  active: boolean;
}

export interface Shift {
  id: string;
  site: Ref;
  name: string;
  startTime: string;
  endTime: string;
  daysOfWeek: number[];
  rondiers: User[];
  active: boolean;
}

export interface Site {
  id: string;
  name: string;
  code?: string;
  client?: string;
  address?: string;
  city?: string;
  location?: GeoPoint;
  geofenceRadius?: number;
  contactName?: string;
  contactPhone?: string;
  instructions?: string;
  active: boolean;
  checkpointsCount?: number;
}

export interface Checkpoint {
  id: string;
  site: string | Ref;
  name: string;
  code?: string;
  description?: string;
  instructions?: string;
  location?: GeoPoint;
  radius?: number;
  requireGps: boolean;
  requirePhoto: boolean;
  qrVersion: number;
  qrPrintedAt?: string;
  qrPayload?: string;
  active: boolean;
}

export interface RouteCheckpoint {
  checkpoint: Checkpoint | string;
  order: number;
  optional?: boolean;
  expectedOffsetMinutes?: number | null;
  expectedWindowMinutes?: number | null;
}

export interface PatrolRoute {
  id: string;
  site: Ref | string;
  name: string;
  description?: string;
  checkpoints: RouteCheckpoint[];
  strictOrder: boolean;
  expectedDurationMinutes: number;
  active: boolean;
}

export interface Schedule {
  id: string;
  site: Ref;
  route: Ref;
  name?: string;
  shift?: Ref | null;
  roundType?: Ref | null;
  assignedAgent?: User | null;
  agents: User[];
  daysOfWeek: number[];
  startTimes: string[];
  every?: { minutes?: number; fromTime?: string; toTime?: string } | null;
  windowMinutes: number;
  manual?: boolean;
  active: boolean;
}

export type PatrolStatus = 'scheduled' | 'in_progress' | 'completed' | 'incomplete' | 'missed' | 'cancelled';

export interface Patrol {
  id: string;
  site: Site | Ref;
  route: PatrolRoute | Ref;
  agent?: User | null;
  shift?: Ref | null;
  roundType?: Ref | null;
  status: PatrolStatus;
  source: string;
  scheduledStart?: string;
  dueBy?: string;
  startedAt?: string;
  endedAt?: string;
  lateAlertSent?: boolean;
  checkpoints: {
    checkpoint: Checkpoint;
    order: number;
    optional?: boolean;
    expectedFrom?: string;
    expectedTo?: string;
    scannedAt?: string;
    status: 'pending' | 'done' | 'suspicious' | 'missed';
  }[];
  stats: { total: number; done: number; suspicious: number; missed: number; incidents: number };
  notes?: string;
}

/**
 * Occurrence d'une ronde pour le calendrier superviseur (GET /patrols/day) : soit une ronde déjà
 * générée (virtual=false, id réel, modifiable/annulable directement), soit un créneau encore
 * « virtuel » issu d'un planning actif mais pas encore matérialisé (virtual=true, id de la forme
 * "virtual:<scheduleId>:<isoDate>") — toute action dessus la matérialise d'abord côté serveur.
 */
export interface PatrolOccurrence {
  id: string;
  virtual: boolean;
  site: Ref;
  route: Ref;
  schedule?: string | null;
  shift?: Ref | null;
  roundType?: Ref | null;
  agent?: User | null;
  eligibleAgents?: User[];
  status: PatrolStatus;
  source: string;
  scheduledStart: string;
  dueBy?: string;
  checkpoints: { checkpoint: Ref; order: number; optional?: boolean; status: string }[];
  stats: { total: number; done: number; suspicious: number; missed: number; incidents: number };
}

export type ScanStatus = 'valid' | 'suspicious' | 'rejected';

export interface ScanEvent {
  id: string;
  agent: User;
  checkpoint?: Checkpoint;
  site?: Ref;
  patrol?: string;
  scannedAt: string;
  receivedAt: string;
  offline: boolean;
  location?: CapturedLocation;
  distanceMeters?: number;
  device?: { deviceId: string; model?: string };
  status: ScanStatus;
  flags: string[];
  flagLabels?: string[];
  comment?: string;
  photo?: Media;
  biometricVerified?: boolean;
  biometricMethod?: 'fingerprint' | 'facial' | 'none';
  reviewed?: { at?: string; decision?: 'accepted' | 'rejected'; note?: string };
}

export interface Media {
  id: string;
  kind: 'photo' | 'video' | 'audio' | 'document';
  mimeType: string;
  url: string;
  size?: number;
  sha256?: string;
  createdAt: string;
}

export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentStatus = 'declared' | 'acknowledged' | 'dispatched' | 'on_site' | 'resolved' | 'closed' | 'cancelled';

export interface Incident {
  id: string;
  reference: string;
  site?: Site;
  checkpoint?: Ref;
  patrol?: string;
  reportedBy: User;
  source: 'agent' | 'sos' | 'centrale' | 'system';
  type: string;
  typeLabel: string;
  severity: Severity;
  severityLabel: string;
  title?: string;
  description?: string;
  location?: CapturedLocation;
  media: Media[];
  status: IncidentStatus;
  statusLabel: string;
  acknowledgedBy?: User;
  acknowledgedAt?: string;
  resolvedAt?: string;
  resolution?: string;
  timeline: { at: string; by?: User; action: string; note?: string }[];
  createdAt: string;
}

export interface Team {
  id: string;
  name: string;
  callSign?: string;
  vehicle?: string;
  phone?: string;
  leader?: User;
  members: User[];
  sites: Ref[];
  available: boolean;
}

export interface Intervention {
  id: string;
  incident: Incident;
  team?: Team;
  members: User[];
  dispatchedBy?: User;
  status: 'dispatched' | 'en_route' | 'on_site' | 'completed' | 'cancelled';
  instructions?: string;
  dispatchedAt: string;
  enRouteAt?: string;
  onSiteAt?: string;
  completedAt?: string;
  report?: string;
}

export interface Alert {
  id: string;
  type: 'sos' | 'incident' | 'suspicious_scan' | 'patrol_late' | 'patrol_missed' | 'agent_offline' | 'device_change';
  level: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  agent?: User;
  site?: Ref;
  patrol?: string;
  incident?: string;
  scan?: string;
  acknowledged: boolean;
  createdAt: string;
}

export interface Meta {
  incidentTypes: { value: string; label: string }[];
  incidentTypeLabels: Record<string, string>;
  severities: { value: Severity; label: string }[];
  incidentStatuses: { value: IncidentStatus; label: string }[];
  incidentTransitions: Record<IncidentStatus, IncidentStatus[]>;
  scanFlags: Record<string, string>;
}
