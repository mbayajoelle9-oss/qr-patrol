const router = require('express').Router();
const { z } = require('zod');
const { Patrol, Route, User, ScanEvent } = require('../models');
const { requireRole, requireOrg } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { asyncHandler, notFound, forbidden, badRequest, paginate } = require('../utils/http');
const { STAFF_ROLES, ROLES, PATROL_STATUS, FLAG_LABELS } = require('../utils/constants');
const {
  POPULATE,
  populatePatrol,
  emitPatrol,
  createPatrolFromRoute,
  buildCheckpointEntries,
  startPatrol,
  finalizePatrol,
  occurrencesForDate,
  resolvePatrol,
  toClientJSON,
} = require('../services/patrols');
const { localDayBounds } = require('../utils/time');
const { sendPush } = require('../services/push');
const { audit } = require('../services/audit');

router.use(requireOrg);
const objectId = z.string().regex(/^[a-f0-9]{24}$/i);

// --- Agent -----------------------------------------------------------------

// Ronde en cours + rondes disponibles aujourd'hui
router.get(
  '/mine',
  requireRole(ROLES.AGENT),
  asyncHandler(async (req, res) => {
    const { start, end } = localDayBounds();
    const current = await Patrol.findOne({ agent: req.user._id, status: PATROL_STATUS.IN_PROGRESS }).populate(POPULATE);
    const upcoming = await Patrol.find({
      organization: req.orgId,
      status: PATROL_STATUS.SCHEDULED,
      scheduledStart: { $lt: end },
      dueBy: { $gt: new Date() },
      $or: [{ agent: req.user._id }, { agent: null, eligibleAgents: req.user._id }],
    })
      .populate(POPULATE)
      .sort({ scheduledStart: 1 })
      .limit(20);
    const done = await Patrol.find({
      agent: req.user._id,
      status: { $in: [PATROL_STATUS.COMPLETED, PATROL_STATUS.INCOMPLETE] },
      endedAt: { $gte: start },
    })
      .populate([{ path: 'route', select: 'name' }, { path: 'site', select: 'name' }])
      .sort({ endedAt: -1 });
    res.json({ current: current ? toClientJSON(current) : null, upcoming: upcoming.map(toClientJSON), done });
  })
);

router.post(
  '/start',
  requireRole(ROLES.AGENT),
  validate(z.object({ patrolId: objectId.optional(), routeId: objectId.optional() })),
  asyncHandler(async (req, res) => {
    const patrol = await startPatrol(req.user, req.body);
    res.status(201).json({ patrol });
  })
);

router.post(
  '/:id/end',
  requireRole(ROLES.AGENT, ...STAFF_ROLES),
  validate(z.object({ notes: z.string().max(2000).optional() })),
  asyncHandler(async (req, res) => {
    const patrol = await Patrol.findOne({ _id: req.params.id, organization: req.orgId }).populate('route', 'name');
    if (!patrol) throw notFound('Ronde introuvable');
    if (req.user.role === ROLES.AGENT && String(patrol.agent) !== String(req.user._id)) throw forbidden();
    if (patrol.status !== PATROL_STATUS.IN_PROGRESS) throw badRequest('La ronde n’est pas en cours');
    await finalizePatrol(patrol, { by: req.user.role === ROLES.AGENT ? 'agent' : 'centrale', notes: req.body.notes });
    res.json({ patrol });
  })
);

// --- Centrale ----------------------------------------------------------------

// Calendrier journalier (superviseur) : toutes les rondes/rondiers affectés à une date donnée,
// qu'elles soient déjà générées ou encore de simples créneaux de planning à venir.
router.get(
  '/day',
  requireRole(...STAFF_ROLES),
  asyncHandler(async (req, res) => {
    const items = await occurrencesForDate(req.orgId, req.query.date, { site: req.query.site || undefined });
    res.json({ date: req.query.date, items });
  })
);

router.get(
  '/',
  requireRole(...STAFF_ROLES),
  asyncHandler(async (req, res) => {
    const { limit, skip } = paginate(req);
    const filter = { organization: req.orgId };
    if (req.query.status) filter.status = { $in: String(req.query.status).split(',') };
    if (req.query.site) filter.site = req.query.site;
    if (req.query.agent) filter.agent = req.query.agent;
    if (req.query.from || req.query.to) {
      filter.scheduledStart = {};
      if (req.query.from) filter.scheduledStart.$gte = new Date(req.query.from);
      if (req.query.to) filter.scheduledStart.$lte = new Date(req.query.to);
    }
    const [items, total] = await Promise.all([
      Patrol.find(filter)
        .populate([
          { path: 'site', select: 'name code' },
          { path: 'route', select: 'name' },
          { path: 'agent', select: 'firstName lastName matricule' },
        ])
        .sort({ scheduledStart: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Patrol.countDocuments(filter),
    ]);
    res.json({ items, total });
  })
);

router.get(
  '/:id',
  requireRole(...STAFF_ROLES, ROLES.AGENT),
  asyncHandler(async (req, res) => {
    const patrol = await Patrol.findOne({ _id: req.params.id, organization: req.orgId }).populate(POPULATE);
    if (!patrol) throw notFound('Ronde introuvable');
    if (req.user.role === ROLES.AGENT && patrol.agent && String(patrol.agent._id) !== String(req.user._id)) throw forbidden();
    const scans = await ScanEvent.find({ patrol: patrol._id })
      .populate('checkpoint', 'name code')
      .sort({ scannedAt: 1 });
    res.json({
      patrol: toClientJSON(patrol),
      scans: scans.map((s) => ({ ...s.toJSON(), flagLabels: (s.flags || []).map((f) => FLAG_LABELS[f] || f) })),
    });
  })
);

// Ronde ponctuelle ordonnée par la centrale
router.post(
  '/',
  requireRole(...STAFF_ROLES),
  validate(
    z.object({
      route: objectId,
      agent: objectId.optional(),
      shift: objectId.optional(),
      roundType: objectId.optional(),
      scheduledStart: z.coerce.date().optional(),
      windowMinutes: z.number().int().min(5).max(24 * 60).default(60),
      notes: z.string().max(1000).optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const route = await Route.findOne({ _id: req.body.route, organization: req.orgId, active: true });
    if (!route) throw badRequest('Parcours invalide');
    if (req.body.agent) {
      const ok = await User.exists({ _id: req.body.agent, organization: req.orgId, role: ROLES.AGENT });
      if (!ok) throw badRequest('Agent invalide');
    }
    const start = req.body.scheduledStart || new Date();
    const patrol = await createPatrolFromRoute(route, {
      agent: req.body.agent,
      shift: req.body.shift,
      roundType: req.body.roundType,
      source: 'manual',
      scheduledStart: start,
      dueBy: new Date(start.getTime() + req.body.windowMinutes * 60000),
      notes: req.body.notes,
      status: PATROL_STATUS.SCHEDULED,
    });
    await populatePatrol(patrol);
    emitPatrol(patrol);
    if (req.body.agent) {
      await sendPush([req.body.agent], {
        title: 'Nouvelle ronde demandée',
        body: `${route.name} — à démarrer ${start > new Date() ? 'à l’heure prévue' : 'maintenant'}`,
        data: { type: 'patrol', patrolId: String(patrol._id) },
      });
    }
    res.status(201).json({ patrol: toClientJSON(patrol) });
  })
);

// Modification depuis le calendrier du superviseur : rondier, shift, type de ronde, parcours,
// heure ou délai. Accepte un id réel ou un id « virtuel » (créneau de planning pas encore généré),
// qu'elle matérialise alors en véritable ronde avant d'appliquer les changements.
const patrolPatchSchema = z
  .object({
    agent: objectId.nullable(),
    shift: objectId.nullable(),
    roundType: objectId.nullable(),
    route: objectId,
    scheduledStart: z.coerce.date(),
    windowMinutes: z.number().int().min(5).max(24 * 60),
  })
  .partial();

router.patch(
  '/:id',
  requireRole(...STAFF_ROLES),
  validate(patrolPatchSchema),
  asyncHandler(async (req, res) => {
    const patrol = await resolvePatrol(req.orgId, req.params.id);
    if (!patrol) throw notFound('Ronde introuvable');
    if (patrol.status !== PATROL_STATUS.SCHEDULED) {
      throw badRequest('Seule une ronde pas encore commencée peut être modifiée');
    }
    const body = req.body;
    if (body.agent !== undefined) {
      if (body.agent) {
        const ok = await User.exists({ _id: body.agent, organization: req.orgId, role: ROLES.AGENT });
        if (!ok) throw badRequest('Agent invalide');
      }
      patrol.agent = body.agent || undefined;
    }
    if (body.shift !== undefined) patrol.shift = body.shift || undefined;
    if (body.roundType !== undefined) patrol.roundType = body.roundType || undefined;
    let route = null;
    if (body.route) {
      route = await Route.findOne({ _id: body.route, organization: req.orgId, active: true });
      if (!route) throw badRequest('Parcours invalide');
      patrol.route = route._id;
      patrol.site = route.site;
    }
    if (body.scheduledStart) patrol.scheduledStart = body.scheduledStart;
    if (route || body.scheduledStart) {
      // Les horaires attendus par point dépendent du parcours et/ou de l'heure de départ : on les recalcule.
      if (!route) route = await Route.findOne({ _id: patrol.route, organization: req.orgId });
      if (route) patrol.checkpoints = buildCheckpointEntries(route, patrol.scheduledStart || new Date());
    }
    const windowMinutes = body.windowMinutes ?? Math.round(((patrol.dueBy || patrol.scheduledStart) - patrol.scheduledStart) / 60000) || 60;
    if (patrol.scheduledStart) patrol.dueBy = new Date(new Date(patrol.scheduledStart).getTime() + windowMinutes * 60000);
    patrol.recomputeStats();
    await patrol.save();
    await populatePatrol(patrol);
    emitPatrol(patrol);
    audit(req, 'patrol.updated', 'Patrol', patrol._id, body);
    res.json({ patrol: toClientJSON(patrol) });
  })
);

router.post(
  '/:id/cancel',
  requireRole(...STAFF_ROLES),
  validate(z.object({ reason: z.string().max(500).optional() })),
  asyncHandler(async (req, res) => {
    const isVirtual = String(req.params.id).startsWith('virtual:');
    const patrol = isVirtual ? await resolvePatrol(req.orgId, req.params.id) : await Patrol.findOne({ _id: req.params.id, organization: req.orgId });
    if (!patrol) throw notFound('Ronde introuvable');
    if (![PATROL_STATUS.SCHEDULED, PATROL_STATUS.IN_PROGRESS].includes(patrol.status)) {
      throw badRequest('Cette ronde ne peut plus être annulée');
    }
    patrol.status = PATROL_STATUS.CANCELLED;
    patrol.endedAt = new Date();
    patrol.notes = [patrol.notes, req.body.reason && `Annulée : ${req.body.reason}`].filter(Boolean).join('\n');
    await patrol.save();
    await populatePatrol(patrol);
    emitPatrol(patrol);
    audit(req, 'patrol.cancelled', 'Patrol', patrol._id, req.body);
    res.json({ patrol: toClientJSON(patrol) });
  })
);

module.exports = router;
