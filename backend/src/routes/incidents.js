const router = require('express').Router();
const { z } = require('zod');
const { Incident, Intervention, Media } = require('../models');
const { requireRole, requireOrg } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { asyncHandler, notFound, forbidden, badRequest, paginate } = require('../utils/http');
const { STAFF_ROLES, ROLES, INCIDENT_TYPES, SEVERITIES, INCIDENT_STATUS } = require('../utils/constants');
const svc = require('../services/incidents');

router.use(requireOrg);

const objectId = z.string().regex(/^[a-f0-9]{24}$/i);
const locationSchema = z
  .object({
    lat: z.number(),
    lng: z.number(),
    accuracy: z.number().nullable().optional(),
    mocked: z.boolean().optional(),
    capturedAt: z.coerce.date().optional(),
  })
  .nullable()
  .optional();

const createSchema = z.object({
  type: z.enum(INCIDENT_TYPES),
  severity: z.enum(SEVERITIES).optional(),
  title: z.string().max(200).optional(),
  description: z.string().max(5000).optional(),
  siteId: objectId.optional(),
  checkpointId: objectId.optional(),
  patrolId: objectId.optional(),
  location: locationSchema,
  mediaIds: z.array(objectId).max(20).optional(),
  clientId: z.string().max(80).optional(),
});

async function checkMedia(req, ids = []) {
  if (!ids.length) return;
  const n = await Media.countDocuments({ _id: { $in: ids }, organization: req.orgId });
  if (n !== ids.length) throw badRequest('Média invalide');
}

async function load(req) {
  const incident = await Incident.findOne({ _id: req.params.id, organization: req.orgId });
  if (!incident) throw notFound('Incident introuvable');
  if ([ROLES.AGENT].includes(req.user.role) && String(incident.reportedBy) !== String(req.user._id)) throw forbidden();
  return incident;
}

// Déclaration (agent sur le terrain ou centrale)
router.post(
  '/',
  requireRole(ROLES.AGENT, ROLES.RESPONDER, ...STAFF_ROLES),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    await checkMedia(req, req.body.mediaIds);
    if (req.body.type === 'sos') throw badRequest('Utilisez le bouton SOS');
    const source = STAFF_ROLES.includes(req.user.role) ? 'centrale' : 'agent';
    const incident = await svc.createIncident(req.user, { ...req.body, organization: req.orgId }, { source });
    res.status(201).json({ incident });
  })
);

// SOS / urgence : incident critique immédiat
router.post(
  '/sos',
  requireRole(ROLES.AGENT, ROLES.RESPONDER),
  validate(z.object({ location: locationSchema, description: z.string().max(1000).optional(), clientId: z.string().max(80).optional() })),
  asyncHandler(async (req, res) => {
    const incident = await svc.createIncident(req.user, { ...req.body, type: 'sos', severity: 'critical' }, { source: 'sos' });
    res.status(201).json({ incident });
  })
);

router.get(
  '/',
  requireRole(ROLES.AGENT, ROLES.RESPONDER, ...STAFF_ROLES),
  asyncHandler(async (req, res) => {
    const { limit, skip } = paginate(req);
    const filter = { organization: req.orgId };
    if ([ROLES.AGENT, ROLES.RESPONDER].includes(req.user.role)) filter.reportedBy = req.user._id;
    if (req.query.status === 'open') {
      filter.status = { $nin: [INCIDENT_STATUS.RESOLVED, INCIDENT_STATUS.CLOSED, INCIDENT_STATUS.CANCELLED] };
    } else if (req.query.status) {
      filter.status = { $in: String(req.query.status).split(',') };
    }
    if (req.query.severity) filter.severity = { $in: String(req.query.severity).split(',') };
    if (req.query.type) filter.type = { $in: String(req.query.type).split(',') };
    if (req.query.site) filter.site = req.query.site;
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
    }
    const [docs, total] = await Promise.all([
      Incident.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Incident.countDocuments(filter),
    ]);
    const items = await Promise.all(docs.map((d) => svc.serialize(d)));
    res.json({ items, total });
  })
);

router.get(
  '/:id',
  requireRole(ROLES.AGENT, ROLES.RESPONDER, ...STAFF_ROLES),
  asyncHandler(async (req, res) => {
    const incident = await load(req);
    const interventions = await Intervention.find({ incident: incident._id })
      .populate([
        { path: 'team', select: 'name callSign vehicle' },
        { path: 'members', select: 'firstName lastName phone' },
        { path: 'dispatchedBy', select: 'firstName lastName' },
      ])
      .sort({ createdAt: -1 });
    res.json({ incident: await svc.serialize(incident), interventions });
  })
);

router.patch(
  '/:id/status',
  requireRole(...STAFF_ROLES),
  validate(z.object({ status: z.enum(Object.values(INCIDENT_STATUS)), note: z.string().max(2000).optional() })),
  asyncHandler(async (req, res) => {
    const incident = await load(req);
    res.json({ incident: await svc.changeStatus(req.user, incident, req.body.status, req.body.note) });
  })
);

router.patch(
  '/:id',
  requireRole(...STAFF_ROLES),
  validate(z.object({ severity: z.enum(SEVERITIES).optional(), type: z.enum(INCIDENT_TYPES).optional(), title: z.string().max(200).optional() })),
  asyncHandler(async (req, res) => {
    const incident = await load(req);
    const changes = Object.entries(req.body).map(([k, v]) => `${k} → ${v}`).join(', ');
    Object.assign(incident, req.body);
    incident.timeline.push({ by: req.user._id, action: 'updated', note: changes });
    await incident.save();
    res.json({ incident: await svc.serialize(incident) });
  })
);

// Commentaire ou ajout de média (agent déclarant ou centrale)
router.post(
  '/:id/notes',
  requireRole(ROLES.AGENT, ROLES.RESPONDER, ...STAFF_ROLES),
  validate(z.object({ note: z.string().max(4000).optional(), mediaIds: z.array(objectId).max(20).optional() })),
  asyncHandler(async (req, res) => {
    const incident = await load(req);
    await checkMedia(req, req.body.mediaIds);
    if (!req.body.note && !req.body.mediaIds?.length) throw badRequest('Commentaire ou média requis');
    res.json({ incident: await svc.addNote(req.user, incident, req.body.note, req.body.mediaIds) });
  })
);

// Envoi d'une équipe d'intervention
router.post(
  '/:id/dispatch',
  requireRole(...STAFF_ROLES),
  validate(
    z
      .object({ teamId: objectId.optional(), memberIds: z.array(objectId).optional(), instructions: z.string().max(2000).optional() })
      .refine((v) => v.teamId || v.memberIds?.length, { message: 'Choisissez une équipe ou des intervenants' })
  ),
  asyncHandler(async (req, res) => {
    const incident = await load(req);
    if ([INCIDENT_STATUS.CLOSED, INCIDENT_STATUS.CANCELLED].includes(incident.status)) throw badRequest('Incident clôturé');
    const intervention = await svc.dispatch(req.user, incident, req.body);
    res.status(201).json({ intervention });
  })
);

module.exports = router;
