// Prise de service, positions GPS et suivi en direct des agents
const router = require('express').Router();
const { z } = require('zod');
const { User, PositionLog, Patrol } = require('../models');
const { requireRole, requireOrg } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { asyncHandler, badRequest } = require('../utils/http');
const { STAFF_ROLES, ROLES, PATROL_STATUS } = require('../utils/constants');
const { toCentrale, onlineUserIds } = require('../services/realtime');

router.use(requireOrg);

const positionSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().nullable().optional(),
  speed: z.number().nullable().optional(),
  heading: z.number().nullable().optional(),
  battery: z.number().min(0).max(1).nullable().optional(),
  mocked: z.boolean().optional(),
  capturedAt: z.coerce.date().optional(),
});

router.post(
  '/duty/start',
  requireRole(ROLES.AGENT, ROLES.RESPONDER),
  validate(z.object({ location: positionSchema.nullable().optional() })),
  asyncHandler(async (req, res) => {
    const u = req.user;
    u.onDuty = true;
    u.dutyStartedAt = new Date();
    if (req.body.location) {
      u.lastPosition = { ...req.body.location, capturedAt: req.body.location.capturedAt || new Date() };
      u.lastSeenAt = new Date();
    }
    await u.save();
    toCentrale(req.orgId, 'agent:duty', { agentId: String(u._id), onDuty: true, name: `${u.firstName} ${u.lastName}` });
    res.json({ user: u });
  })
);

router.post(
  '/duty/end',
  requireRole(ROLES.AGENT, ROLES.RESPONDER),
  asyncHandler(async (req, res) => {
    const running = await Patrol.exists({ agent: req.user._id, status: PATROL_STATUS.IN_PROGRESS });
    if (running) throw badRequest('Terminez votre ronde en cours avant de finir votre service');
    req.user.onDuty = false;
    req.user.dutyStartedAt = undefined;
    await req.user.save();
    toCentrale(req.orgId, 'agent:duty', { agentId: String(req.user._id), onDuty: false });
    res.json({ user: req.user });
  })
);

// Positions envoyées périodiquement par l'app (lot possible si réseau coupé)
router.post(
  '/positions',
  requireRole(ROLES.AGENT, ROLES.RESPONDER),
  validate(z.object({ positions: z.array(positionSchema).min(1).max(500) })),
  asyncHandler(async (req, res) => {
    const patrol = await Patrol.findOne({ agent: req.user._id, status: PATROL_STATUS.IN_PROGRESS }).select('_id');
    const docs = req.body.positions.map((p) => ({
      organization: req.orgId,
      agent: req.user._id,
      patrol: patrol?._id,
      ...p,
      capturedAt: p.capturedAt || new Date(),
    }));
    await PositionLog.insertMany(docs, { ordered: false });
    const last = docs.reduce((a, b) => (new Date(a.capturedAt) > new Date(b.capturedAt) ? a : b));
    await User.updateOne(
      { _id: req.user._id },
      {
        lastPosition: {
          lat: last.lat,
          lng: last.lng,
          accuracy: last.accuracy,
          speed: last.speed,
          heading: last.heading,
          mocked: last.mocked,
          capturedAt: last.capturedAt,
        },
        lastSeenAt: new Date(),
      }
    );
    toCentrale(req.orgId, 'position:update', {
      agentId: String(req.user._id),
      name: `${req.user.firstName} ${req.user.lastName}`,
      lat: last.lat,
      lng: last.lng,
      accuracy: last.accuracy,
      battery: last.battery,
      capturedAt: last.capturedAt,
      patrolId: patrol?._id,
    });
    res.json({ ok: true, count: docs.length });
  })
);

// Carte en direct : agents en service + dernière position
router.get(
  '/live',
  requireRole(...STAFF_ROLES),
  asyncHandler(async (req, res) => {
    const agents = await User.find({
      organization: req.orgId,
      role: { $in: [ROLES.AGENT, ROLES.RESPONDER] },
      active: true,
      $or: [{ onDuty: true }, { lastSeenAt: { $gte: new Date(Date.now() - 12 * 3600000) } }],
    })
      .select('firstName lastName matricule role onDuty dutyStartedAt lastPosition lastSeenAt sites team')
      .populate('sites', 'name')
      .populate('team', 'name');
    const patrols = await Patrol.find({ organization: req.orgId, status: PATROL_STATUS.IN_PROGRESS })
      .select('agent route site stats startedAt dueBy')
      .populate('route', 'name')
      .populate('site', 'name');
    const byAgent = new Map(patrols.map((p) => [String(p.agent), p]));
    const online = onlineUserIds();
    res.json({
      items: agents.map((a) => ({
        ...a.toJSON(),
        online: online.has(String(a._id)),
        currentPatrol: byAgent.get(String(a._id)) || null,
      })),
    });
  })
);

// Tracé d'un agent sur une période
router.get(
  '/track/:agentId',
  requireRole(...STAFF_ROLES),
  asyncHandler(async (req, res) => {
    const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 12 * 3600000);
    const to = req.query.to ? new Date(req.query.to) : new Date();
    const points = await PositionLog.find({
      organization: req.orgId,
      agent: req.params.agentId,
      capturedAt: { $gte: from, $lte: to },
    })
      .select('lat lng accuracy capturedAt speed battery')
      .sort({ capturedAt: 1 })
      .limit(5000);
    res.json({ items: points });
  })
);

module.exports = router;
