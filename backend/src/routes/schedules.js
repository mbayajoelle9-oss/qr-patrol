const router = require('express').Router();
const { z } = require('zod');
const { Schedule, Route, User } = require('../models');
const { requireRole, requireOrg } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { asyncHandler, notFound, badRequest } = require('../utils/http');
const { ADMIN_ROLES, STAFF_ROLES, ROLES } = require('../utils/constants');
const { generateScheduledPatrols } = require('../services/patrols');
const { audit } = require('../services/audit');

router.use(requireOrg);

const objectId = z.string().regex(/^[a-f0-9]{24}$/i);
const hhmm = z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'Format HH:mm');
const scheduleSchema = z
  .object({
    route: objectId,
    name: z.string().max(120).optional(),
    agents: z.array(objectId).default([]),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).default([0, 1, 2, 3, 4, 5, 6]),
    startTimes: z.array(hhmm).default([]),
    every: z
      .object({ minutes: z.number().int().min(10).max(24 * 60), fromTime: hhmm, toTime: hhmm })
      .partial()
      .optional()
      .nullable(),
    windowMinutes: z.number().int().min(5).max(24 * 60).default(60),
    active: z.boolean().optional(),
    validFrom: z.coerce.date().optional().nullable(),
    validUntil: z.coerce.date().optional().nullable(),
  })
  .refine((s) => s.startTimes.length > 0 || (s.every && s.every.minutes), {
    message: 'Indiquez des heures de départ ou une fréquence',
  });

async function check(orgId, body) {
  const route = await Route.findOne({ _id: body.route, organization: orgId });
  if (!route) throw badRequest('Parcours invalide');
  if (body.agents?.length) {
    const n = await User.countDocuments({ _id: { $in: body.agents }, organization: orgId, role: ROLES.AGENT });
    if (n !== body.agents.length) throw badRequest('Agent invalide');
  }
  return route;
}

router.get(
  '/',
  requireRole(...STAFF_ROLES),
  asyncHandler(async (req, res) => {
    const filter = { organization: req.orgId };
    if (req.query.site) filter.site = req.query.site;
    const items = await Schedule.find(filter)
      .populate('route', 'name')
      .populate('site', 'name code')
      .populate('agents', 'firstName lastName matricule')
      .sort({ createdAt: -1 });
    res.json({ items });
  })
);

router.post(
  '/',
  requireRole(...ADMIN_ROLES),
  validate(scheduleSchema),
  asyncHandler(async (req, res) => {
    const route = await check(req.orgId, req.body);
    const schedule = await Schedule.create({ ...req.body, site: route.site, organization: req.orgId });
    await generateScheduledPatrols({ hoursAhead: 24 });
    audit(req, 'schedule.created', 'Schedule', schedule._id);
    res.status(201).json({ schedule });
  })
);

router.patch(
  '/:id',
  requireRole(...ADMIN_ROLES),
  validate(scheduleSchema.innerType().partial()),
  asyncHandler(async (req, res) => {
    const schedule = await Schedule.findOne({ _id: req.params.id, organization: req.orgId });
    if (!schedule) throw notFound('Planning introuvable');
    if (req.body.route || req.body.agents) {
      const route = await check(req.orgId, { route: req.body.route || schedule.route, agents: req.body.agents });
      schedule.site = route.site;
    }
    Object.assign(schedule, req.body);
    await schedule.save();
    audit(req, 'schedule.updated', 'Schedule', schedule._id, req.body);
    res.json({ schedule });
  })
);

router.delete(
  '/:id',
  requireRole(...ADMIN_ROLES),
  asyncHandler(async (req, res) => {
    const s = await Schedule.findOneAndDelete({ _id: req.params.id, organization: req.orgId });
    if (!s) throw notFound('Planning introuvable');
    audit(req, 'schedule.deleted', 'Schedule', s._id);
    res.json({ ok: true });
  })
);

router.post(
  '/generate',
  requireRole(...ADMIN_ROLES),
  asyncHandler(async (_req, res) => {
    const created = await generateScheduledPatrols({ hoursAhead: 24 });
    res.json({ created });
  })
);

module.exports = router;
