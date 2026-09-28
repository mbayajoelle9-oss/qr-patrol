const { Patrol, ScanEvent, Incident, User, Site } = require('../models');
const { FLAG_LABELS, INCIDENT_TYPE_LABELS, SEVERITY_LABELS } = require('../utils/constants');

/** Statistiques consolidées sur une période (et éventuellement un site). */
async function buildSummary(orgId, { from, to, site }) {
  const match = { organization: orgId };
  if (site) match.site = site;

  const patrolMatch = { ...match, scheduledStart: { $gte: from, $lte: to } };
  const scanMatch = { ...match, scannedAt: { $gte: from, $lte: to } };
  const incidentMatch = { ...match, createdAt: { $gte: from, $lte: to } };

  const tz = process.env.TZ || 'Africa/Kinshasa';

  const [patrolByStatus, patrolsByDay, scanByStatus, flags, byAgent, incidentsByType, incidentsBySeverity, responseTimes, bySite] =
    await Promise.all([
      Patrol.aggregate([{ $match: patrolMatch }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
      Patrol.aggregate([
        { $match: patrolMatch },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$scheduledStart', timezone: tz } },
            total: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
            incomplete: { $sum: { $cond: [{ $eq: ['$status', 'incomplete'] }, 1, 0] } },
            missed: { $sum: { $cond: [{ $eq: ['$status', 'missed'] }, 1, 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      ScanEvent.aggregate([{ $match: scanMatch }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
      ScanEvent.aggregate([{ $match: scanMatch }, { $unwind: '$flags' }, { $group: { _id: '$flags', n: { $sum: 1 } } }, { $sort: { n: -1 } }]),
      Patrol.aggregate([
        { $match: { ...patrolMatch, agent: { $ne: null } } },
        {
          $group: {
            _id: '$agent',
            patrols: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
            incomplete: { $sum: { $cond: [{ $eq: ['$status', 'incomplete'] }, 1, 0] } },
            missed: { $sum: { $cond: [{ $eq: ['$status', 'missed'] }, 1, 0] } },
            checkpointsDone: { $sum: '$stats.done' },
            checkpointsTotal: { $sum: '$stats.total' },
            suspicious: { $sum: '$stats.suspicious' },
          },
        },
        { $sort: { patrols: -1 } },
      ]),
      Incident.aggregate([{ $match: incidentMatch }, { $group: { _id: '$type', n: { $sum: 1 } } }, { $sort: { n: -1 } }]),
      Incident.aggregate([{ $match: incidentMatch }, { $group: { _id: '$severity', n: { $sum: 1 } } }]),
      Incident.aggregate([
        { $match: { ...incidentMatch, acknowledgedAt: { $ne: null } } },
        {
          $group: {
            _id: null,
            avgAckSeconds: { $avg: { $divide: [{ $subtract: ['$acknowledgedAt', '$createdAt'] }, 1000] } },
            avgResolveSeconds: {
              $avg: {
                $cond: [{ $ifNull: ['$resolvedAt', false] }, { $divide: [{ $subtract: ['$resolvedAt', '$createdAt'] }, 1000] }, null],
              },
            },
          },
        },
      ]),
      Patrol.aggregate([
        { $match: patrolMatch },
        {
          $group: {
            _id: '$site',
            total: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
            missed: { $sum: { $cond: [{ $eq: ['$status', 'missed'] }, 1, 0] } },
          },
        },
      ]),
    ]);

  const agentIds = byAgent.map((a) => a._id);
  const siteIds = bySite.map((s) => s._id);
  const [agents, sites] = await Promise.all([
    User.find({ _id: { $in: agentIds } }).select('firstName lastName matricule'),
    Site.find({ _id: { $in: siteIds } }).select('name code'),
  ]);
  const agentMap = new Map(agents.map((a) => [String(a._id), a]));
  const siteMap = new Map(sites.map((s) => [String(s._id), s]));
  const count = (arr) => Object.fromEntries(arr.map((x) => [x._id, x.n]));

  const ps = count(patrolByStatus);
  const expected = (ps.completed || 0) + (ps.incomplete || 0) + (ps.missed || 0);

  return {
    period: { from, to },
    patrols: {
      byStatus: ps,
      total: Object.values(ps).reduce((a, b) => a + b, 0),
      complianceRate: expected ? Math.round(((ps.completed || 0) / expected) * 100) : null,
      byDay: patrolsByDay.map((d) => ({ date: d._id, ...d, _id: undefined })),
    },
    scans: {
      byStatus: count(scanByStatus),
      flags: flags.map((f) => ({ code: f._id, label: FLAG_LABELS[f._id] || f._id, count: f.n })),
    },
    agents: byAgent.map((a) => {
      const u = agentMap.get(String(a._id));
      return {
        id: a._id,
        name: u ? `${u.firstName} ${u.lastName}` : '—',
        matricule: u?.matricule,
        ...a,
        _id: undefined,
        complianceRate: a.patrols ? Math.round((a.completed / a.patrols) * 100) : null,
        checkpointRate: a.checkpointsTotal ? Math.round((a.checkpointsDone / a.checkpointsTotal) * 100) : null,
      };
    }),
    sites: bySite.map((s) => ({
      id: s._id,
      name: siteMap.get(String(s._id))?.name || '—',
      total: s.total,
      completed: s.completed,
      missed: s.missed,
      complianceRate: s.total ? Math.round((s.completed / s.total) * 100) : null,
    })),
    incidents: {
      byType: incidentsByType.map((t) => ({ type: t._id, label: INCIDENT_TYPE_LABELS[t._id] || t._id, count: t.n })),
      bySeverity: incidentsBySeverity.map((s) => ({ severity: s._id, label: SEVERITY_LABELS[s._id], count: s.n })),
      total: incidentsByType.reduce((a, b) => a + b.n, 0),
      avgAckMinutes: responseTimes[0]?.avgAckSeconds != null ? Math.round(responseTimes[0].avgAckSeconds / 60) : null,
      avgResolveMinutes: responseTimes[0]?.avgResolveSeconds != null ? Math.round(responseTimes[0].avgResolveSeconds / 60) : null,
    },
  };
}

module.exports = { buildSummary };
