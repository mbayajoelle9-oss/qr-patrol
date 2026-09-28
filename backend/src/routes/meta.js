const router = require('express').Router();
const C = require('../utils/constants');

// Listes et libellés partagés par le web et le mobile
router.get('/', (_req, res) => {
  res.json({
    roles: C.ROLES,
    incidentTypes: C.INCIDENT_TYPES.filter((t) => t !== 'sos').map((t) => ({ value: t, label: C.INCIDENT_TYPE_LABELS[t] })),
    incidentTypeLabels: C.INCIDENT_TYPE_LABELS,
    severities: C.SEVERITIES.map((s) => ({ value: s, label: C.SEVERITY_LABELS[s] })),
    incidentStatuses: Object.values(C.INCIDENT_STATUS).map((s) => ({ value: s, label: C.INCIDENT_STATUS_LABELS[s] })),
    incidentTransitions: C.INCIDENT_TRANSITIONS,
    scanFlags: C.FLAG_LABELS,
  });
});

module.exports = router;
