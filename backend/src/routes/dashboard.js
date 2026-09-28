const router = require('express').Router();
const { User, Patrol, ScanEvent, Incident, Alert, Site, Checkpoint, Intervention } = require('../models');
const { requireRole, requireOrg } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');
const { STAFF_ROLES, ROLES, PATROL_STATUS, INCIDENT_STATUS, FLAG_LABELS } = require('../utils/constants');
const { localDayBounds } = require('../utils/time');
const { onlineUserIds } = require('../services/realtime');
const { serialize } = require('../services/incidents');

router.use(requireOrg, requireRole(...STAFF_ROLES));

// Vue d'ensemble de la centrale (chargement initial ; ensuite mises à jour via Socket.IO)
router.get(
  '/overview',
  asyncHandler(async (req, res) => {
    const org = req.orgId;
    const { start } = localDayBounds();
    const now = new Date();
    const openIncidentStatuses = [
      INCIDENT_STATUS.DECLARED,
      INCIDENT_STATUS.ACKNOWLEDGED,
      INCIDENT_STATUS.DISPATCHED,
      INCIDENT_STATUS.ON_SITE,
    ];

    const [
      agents,
      inProgress,
      latePatrols,
      todayPatrolStats,
      todayScanStats,
      openIncidentDocs,
      recentScans,
      openAlerts,
      sites,
      checkpoints,
      activeInterventions,
    ] = await Promise.all([
      User.find({ organization: org, role: { $in: [ROLES.AGENT, ROLES.RESPONDER] }, active: true }).select(
        'firstName lastName matricule role onDuty lastPosition lastSeenAt dutyStartedAt'
      ),
      Patrol.find({ organization: org, status: PATROL_STATUS.IN_PROGRESS }).populate([
        { path: 'agent', select: 'firstName lastName matricule' },
        { path: 'route', select: 'name' },
        { path: 'site', select: 'name' },
      ]),
      Patrol.find({
        organization: org,
        status: PATROL_STATUS.SCHEDULED,
        lateAlertSent: true,
        dueBy: { $gt: now },
      }).populate([
        { path: 'agent', select: 'firstName lastName' },
        { path: 'route', select: 'name' },
        { path: 'site', select: 'name' },
      ]),
      Patrol.aggregate([
        { $match: { organization: org, scheduledStart: { $gte: start, $lte: now } } },
        { $group: { _id: '$status', n: { $sum: 1 } } },
      ]),
      ScanEvent.aggregate([
        { $match: { organization: org, scannedAt: { $gte: start } } },
        { $group: { _id: '$status', n: { $sum: 1 } } },
      ]),
      Incident.find({ organization: org, status: { $in: openIncidentStatuses } }).sort({ createdAt: -1 }).limit(50),
      ScanEvent.find({ organization: org })
        .sort({ scannedAt: -1 })
        .limit(30)
        .populate([
          { path: 'agent', select: 'firstName lastName matricule' },
          { path: 'checkpoint', select: 'name code' },
          { path: 'site', select: 'name' },
        ]),
      Alert.find({ organization: org, acknowledged: false })
        .sort({ createdAt: -1 })
        .limit(50)
        .populate('agent', 'firstName lastName')
        .populate('site', 'name'),
      Site.find({ organization: org, active: true }).select('name code location geofenceRadius address'),
      Checkpoint.find({ organization: org, active: true }).select('name code site location radius'),
      Intervention.find({ organization: org, status: { $in: ['dispatched', 'en_route', 'on_site'] } })
        .populate('team', 'name callSign')
        .populate('incident', 'reference type severity'),
    ]);

    const online = onlineUserIds();
    const toMap = (arr) => Object.fromEntries(arr.map((x) => [x._id, x.n]));
    const patrolCounts = toMap(todayPatrolStats);
    const scanCounts = toMap(todayScanStats);
    const openIncidents = await Promise.all(openIncidentDocs.map((i) => serialize(i)));

    const doneToday = (patrolCounts.completed || 0) + (patrolCounts.incomplete || 0);
    const expectedToday = doneToday + (patrolCounts.missed || 0) + (patrolCounts.in_progress || 0);

    res.json({
      kpis: {
        agentsTotal: agents.length,
        agentsOnDuty: agents.filter((a) => a.onDuty).length,
        agentsOnline: agents.filter((a) => online.has(String(a._id))).length,
        patrolsInProgress: inProgress.length,
        patrolsLate: latePatrols.length,
        patrolsCompletedToday: patrolCounts.completed || 0,
        patrolsIncompleteToday: patrolCounts.incomplete || 0,
        patrolsMissedToday: patrolCounts.missed || 0,
        complianceRate: expectedToday ? Math.round(((patrolCounts.completed || 0) / expectedToday) * 100) : null,
        scansToday: (scanCounts.valid || 0) + (scanCounts.suspicious || 0) + (scanCounts.rejected || 0),
        scansValidToday: scanCounts.valid || 0,
        scansSuspiciousToday: (scanCounts.suspicious || 0) + (scanCounts.rejected || 0),
        incidentsOpen: openIncidents.length,
        incidentsCritical: openIncidents.filter((i) => ['critical', 'high'].includes(i.severity)).length,
        alertsUnread: openAlerts.length,
        interventionsActive: activeInterventions.length,
      },
      agents: agents.map((a) => ({ ...a.toJSON(), online: online.has(String(a._id)) })),
      patrolsInProgress: inProgress,
      latePatrols,
      openIncidents,
      recentScans: recentScans.map((s) => ({ ...s.toJSON(), flagLabels: (s.flags || []).map((f) => FLAG_LABELS[f] || f) })),
      alerts: openAlerts,
      sites,
      checkpoints,
      interventions: activeInterventions,
    });
  })
);

module.exports = router;
