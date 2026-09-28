const { Incident, Intervention, Patrol, User, Team, nextSeq } = require('../models');
const {
  INCIDENT_TRANSITIONS,
  INCIDENT_STATUS,
  INCIDENT_TYPE_LABELS,
  SEVERITY_LABELS,
  INCIDENT_STATUS_LABELS,
  PATROL_STATUS,
  STAFF_ROLES,
} = require('../utils/constants');
const { toCentrale, toUser } = require('./realtime');
const { raiseAlert } = require('./alerts');
const { sendPush } = require('./push');
const { withUrls } = require('./media');

const POPULATE = [
  { path: 'reportedBy', select: 'firstName lastName matricule phone' },
  { path: 'site', select: 'name code location address' },
  { path: 'checkpoint', select: 'name code' },
  { path: 'media' },
  { path: 'acknowledgedBy', select: 'firstName lastName' },
  { path: 'timeline.by', select: 'firstName lastName role' },
];

async function serialize(incident) {
  await Incident.populate(incident, POPULATE);
  const json = incident.toJSON();
  json.media = withUrls(incident.media);
  json.typeLabel = INCIDENT_TYPE_LABELS[json.type];
  json.severityLabel = SEVERITY_LABELS[json.severity];
  json.statusLabel = INCIDENT_STATUS_LABELS[json.status];
  return json;
}

async function broadcast(incident, event = 'incident:updated') {
  const json = await serialize(incident);
  toCentrale(incident.organization, event, json);
  toUser(incident.reportedBy?._id || incident.reportedBy, event, json);
  return json;
}

async function makeReference() {
  const year = new Date().getFullYear();
  const seq = await nextSeq(`incident:${year}`);
  return `INC-${year}-${String(seq).padStart(6, '0')}`;
}

/** Création d'un incident (agent, SOS ou centrale). */
async function createIncident(user, input, { source = 'agent' } = {}) {
  if (input.clientId) {
    const existing = await Incident.findOne({ reportedBy: user._id, clientId: input.clientId });
    if (existing) return serialize(existing);
  }

  // Rattachement automatique à la ronde en cours de l'agent
  let patrol = null;
  if (!input.patrolId && source !== 'centrale') {
    patrol = await Patrol.findOne({ agent: user._id, status: PATROL_STATUS.IN_PROGRESS });
  }
  const orgId = user.organization || input.organization;

  const incident = await Incident.create({
    organization: orgId,
    reference: await makeReference(),
    site: input.siteId || patrol?.site || (user.sites?.length === 1 ? user.sites[0] : undefined),
    checkpoint: input.checkpointId,
    patrol: input.patrolId || patrol?._id,
    reportedBy: user._id,
    source,
    type: input.type,
    severity: input.severity || (input.type === 'sos' ? 'critical' : 'medium'),
    title: input.title || INCIDENT_TYPE_LABELS[input.type],
    description: input.description,
    location: input.location,
    media: input.mediaIds || [],
    clientId: input.clientId,
    timeline: [{ by: user._id, action: 'created', note: source === 'sos' ? 'Alerte SOS déclenchée' : undefined }],
  });

  if (incident.patrol) await Patrol.updateOne({ _id: incident.patrol }, { $inc: { 'stats.incidents': 1 } });
  if (input.location?.lat != null) {
    await User.updateOne({ _id: user._id }, { lastPosition: input.location, lastSeenAt: new Date() });
  }

  const json = await broadcast(incident, 'incident:new');

  const isCritical = ['high', 'critical'].includes(incident.severity);
  await raiseAlert({
    organization: orgId,
    type: source === 'sos' ? 'sos' : 'incident',
    level: source === 'sos' || incident.severity === 'critical' ? 'critical' : isCritical ? 'warning' : 'info',
    title: source === 'sos' ? '🚨 SOS — AGENT EN DANGER' : `Nouvel incident : ${json.typeLabel}`,
    message: `${user.firstName} ${user.lastName}${json.site ? ` — ${json.site.name}` : ''} · Gravité ${json.severityLabel}`,
    site: incident.site,
    agent: user._id,
    incident: incident._id,
  });
  if (source === 'sos') toCentrale(orgId, 'sos:new', json);

  // Push aux superviseurs (s'ils ont l'application mobile) pour les incidents graves
  if (isCritical || source === 'sos') {
    const supervisors = await User.find({ organization: orgId, role: { $in: STAFF_ROLES }, active: true }).select('_id');
    await sendPush(
      supervisors.map((s) => s._id),
      {
        title: source === 'sos' ? '🚨 SOS agent' : `Incident ${json.severityLabel.toLowerCase()}`,
        body: `${json.typeLabel} — ${user.firstName} ${user.lastName}`,
        data: { type: 'incident', incidentId: String(incident._id) },
      }
    );
  }
  return json;
}

function assertTransition(from, to) {
  if (from === to) return;
  const allowed = INCIDENT_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    throw Object.assign(
      new Error(`Transition impossible : ${INCIDENT_STATUS_LABELS[from]} → ${INCIDENT_STATUS_LABELS[to]}`),
      { status: 409 }
    );
  }
}

async function changeStatus(user, incident, status, note) {
  assertTransition(incident.status, status);
  incident.status = status;
  const now = new Date();
  if (status === INCIDENT_STATUS.ACKNOWLEDGED && !incident.acknowledgedAt) {
    incident.acknowledgedAt = now;
    incident.acknowledgedBy = user._id;
  }
  if (status === INCIDENT_STATUS.RESOLVED) {
    incident.resolvedAt = now;
    if (note) incident.resolution = note;
  }
  if (status === INCIDENT_STATUS.CLOSED) incident.closedAt = now;
  incident.timeline.push({ by: user._id, action: `status:${status}`, note });
  await incident.save();

  // Informer l'agent déclarant que la centrale a pris en charge
  if (status === INCIDENT_STATUS.ACKNOWLEDGED || status === INCIDENT_STATUS.DISPATCHED) {
    await sendPush([incident.reportedBy?._id || incident.reportedBy], {
      title: status === INCIDENT_STATUS.ACKNOWLEDGED ? 'Incident pris en charge' : 'Équipe d’intervention envoyée',
      body: incident.reference,
      data: { type: 'incident', incidentId: String(incident._id) },
    });
  }
  return broadcast(incident);
}

async function addNote(user, incident, note, mediaIds = []) {
  incident.timeline.push({ by: user._id, action: mediaIds.length ? 'media' : 'comment', note });
  if (mediaIds.length) incident.media.push(...mediaIds);
  await incident.save();
  return broadcast(incident);
}

/** Envoi d'une équipe d'intervention sur un incident. */
async function dispatch(user, incident, { teamId, memberIds = [], instructions }) {
  let team = null;
  if (teamId) {
    team = await Team.findOne({ _id: teamId, organization: incident.organization });
    if (!team) throw Object.assign(new Error('Équipe introuvable'), { status: 404 });
  }
  const members = memberIds.length ? memberIds : team?.members || [];
  const intervention = await Intervention.create({
    organization: incident.organization,
    incident: incident._id,
    team: team?._id,
    members,
    dispatchedBy: user._id,
    instructions,
  });
  if (team) await Team.updateOne({ _id: team._id }, { available: false });

  if ([INCIDENT_STATUS.DECLARED, INCIDENT_STATUS.ACKNOWLEDGED].includes(incident.status)) {
    if (!incident.acknowledgedAt) {
      incident.acknowledgedAt = new Date();
      incident.acknowledgedBy = user._id;
    }
    incident.status = INCIDENT_STATUS.DISPATCHED;
  }
  incident.timeline.push({
    by: user._id,
    action: 'dispatch',
    note: `${team ? `Équipe ${team.name}` : 'Intervenants'} envoyée${instructions ? ` — ${instructions}` : ''}`,
  });
  await incident.save();

  const populatedIncident = await serialize(incident);
  if (members.length) {
    await sendPush(members, {
      title: '🚓 Intervention demandée',
      body: `${populatedIncident.typeLabel} — ${populatedIncident.site?.name || 'voir position'}`,
      data: { type: 'intervention', interventionId: String(intervention._id), incidentId: String(incident._id) },
    });
    members.forEach((m) => toUser(m, 'intervention:new', { interventionId: intervention._id, incident: populatedIncident }));
  }
  toCentrale(incident.organization, 'incident:updated', populatedIncident);
  const iv = await Intervention.findById(intervention._id).populate([
    { path: 'team', select: 'name callSign' },
    { path: 'members', select: 'firstName lastName phone' },
  ]);
  toCentrale(incident.organization, 'intervention:updated', iv.toJSON());
  return iv;
}

/** Avancement d'une intervention (répercuté sur l'incident). */
async function updateIntervention(user, intervention, { status, report }) {
  const now = new Date();
  intervention.status = status || intervention.status;
  if (status === 'en_route') intervention.enRouteAt = now;
  if (status === 'on_site') intervention.onSiteAt = now;
  if (status === 'completed' || status === 'cancelled') intervention.completedAt = now;
  if (report) intervention.report = report;
  await intervention.save();

  const incident = await Incident.findById(intervention.incident);
  if (incident) {
    if (status === 'on_site' && incident.status === INCIDENT_STATUS.DISPATCHED) {
      incident.status = INCIDENT_STATUS.ON_SITE;
    }
    if (status === 'completed' && [INCIDENT_STATUS.DISPATCHED, INCIDENT_STATUS.ON_SITE].includes(incident.status)) {
      incident.status = INCIDENT_STATUS.RESOLVED;
      incident.resolvedAt = now;
      if (report) incident.resolution = report;
    }
    incident.timeline.push({ by: user._id, action: `intervention:${status}`, note: report });
    await incident.save();
    await broadcast(incident);
  }
  if ((status === 'completed' || status === 'cancelled') && intervention.team) {
    await Team.updateOne({ _id: intervention.team }, { available: true });
  }
  await intervention.populate([
    { path: 'team', select: 'name callSign' },
    { path: 'members', select: 'firstName lastName phone' },
  ]);
  toCentrale(intervention.organization, 'intervention:updated', intervention.toJSON());
  return intervention;
}

module.exports = { serialize, createIncident, changeStatus, addNote, dispatch, updateIntervention, POPULATE };
