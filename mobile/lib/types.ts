export type Role = 'super_admin' | 'admin' | 'supervisor' | 'agent' | 'responder';

export interface OrgSettings {
  positionPingSeconds: number;
  enforceDeviceBinding: boolean;
  [k: string]: unknown;
}

export interface Organization {
  id: string;
  name: string;
  code: string;
  primaryColor?: string;
  contactPhone?: string;
  settings: OrgSettings;
}

export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number];
}

export interface User {
  id: string;
  role: Role;
  firstName: string;
  lastName: string;
  matricule?: string;
  phone?: string;
  email?: string;
  onDuty?: boolean;
  dutyStartedAt?: string;
  sites?: { id: string; name: string; address?: string }[];
  organization?: Organization | null;
  photo?: { id: string; url: string } | null;
}

export interface Checkpoint {
  id: string;
  name: string;
  code?: string;
  instructions?: string;
  requirePhoto?: boolean;
  location?: GeoPoint;
  radius?: number;
}

export interface PatrolCheckpoint {
  checkpoint: Checkpoint;
  order: number;
  optional?: boolean;
  scannedAt?: string;
  status: 'pending' | 'done' | 'suspicious' | 'missed';
}

export interface Patrol {
  id: string;
  site: { id: string; name: string };
  route: { id: string; name: string; strictOrder?: boolean; expectedDurationMinutes?: number };
  agent?: { id: string; firstName: string; lastName: string } | null;
  status: 'scheduled' | 'in_progress' | 'completed' | 'incomplete' | 'missed' | 'cancelled';
  scheduledStart?: string;
  dueBy?: string;
  startedAt?: string;
  endedAt?: string;
  checkpoints: PatrolCheckpoint[];
  stats: { total: number; done: number; suspicious: number; missed: number; incidents: number };
  notes?: string;
}

export interface ScanResult {
  status: 'valid' | 'suspicious' | 'rejected';
  message: string;
  flags: { code: string; label: string }[];
  checkpoint: { id: string; name: string; code?: string; instructions?: string; requirePhoto?: boolean } | null;
  scan: { id: string; scannedAt: string; distanceMeters?: number };
  patrol: Patrol | null;
}

export interface Incident {
  id: string;
  reference: string;
  type: string;
  typeLabel: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  severityLabel: string;
  status: string;
  statusLabel: string;
  title?: string;
  description?: string;
  site?: { id: string; name: string };
  media: { id: string; kind: string; url: string }[];
  timeline: { at: string; action: string; note?: string; by?: { firstName: string; lastName: string } }[];
  createdAt: string;
}

export interface Intervention {
  id: string;
  status: 'dispatched' | 'en_route' | 'on_site' | 'completed' | 'cancelled';
  instructions?: string;
  dispatchedAt: string;
  team?: { name: string; callSign?: string };
  incident: {
    id: string;
    reference: string;
    type: string;
    severity: string;
    status: string;
    title?: string;
    location?: { lat: number; lng: number };
    site?: { name: string; address?: string; location?: GeoPoint };
    reportedBy?: { firstName: string; lastName: string; phone?: string };
  };
}

export interface CapturedLocation {
  lat: number;
  lng: number;
  accuracy?: number | null;
  altitude?: number | null;
  speed?: number | null;
  heading?: number | null;
  mocked?: boolean;
  capturedAt: string;
}
