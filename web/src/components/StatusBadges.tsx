import { Badge } from './ui';
import { INCIDENT_STATUS, INTERVENTION_STATUS, PATROL_STATUS, SCAN_STATUS, SEVERITY } from '@/lib/format';
import type { IncidentStatus, PatrolStatus, Severity } from '@/lib/types';

export const PatrolBadge = ({ status }: { status: PatrolStatus }) => (
  <Badge tone={PATROL_STATUS[status]?.tone}>{PATROL_STATUS[status]?.label || status}</Badge>
);
export const SeverityBadge = ({ severity }: { severity: Severity }) => (
  <Badge tone={SEVERITY[severity]?.tone}>{SEVERITY[severity]?.label || severity}</Badge>
);
export const IncidentBadge = ({ status }: { status: IncidentStatus }) => (
  <Badge tone={INCIDENT_STATUS[status]?.tone}>{INCIDENT_STATUS[status]?.label || status}</Badge>
);
export const InterventionBadge = ({ status }: { status: string }) => (
  <Badge tone={INTERVENTION_STATUS[status]?.tone}>{INTERVENTION_STATUS[status]?.label || status}</Badge>
);
export const ScanBadge = ({ status }: { status: string }) => (
  <Badge tone={SCAN_STATUS[status]?.tone}>{SCAN_STATUS[status]?.label || status}</Badge>
);
