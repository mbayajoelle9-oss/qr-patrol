// Parcours de ronde (modèle Route)
const router = require('express').Router();
const { z } = require('zod');
const { Route, Site, Checkpoint } = require('../models');
const { requireRole, requireOrg } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { asyncHandler, notFound, badRequest } = require('../utils/http');
const { ADMIN_ROLES, STAFF_ROLES, ROLES } = require('../utils/constants');
const { audit } = require('../services/audit');

router.use(requireOrg);

const objectId = z.string().regex(/^[a-f0-9]{24}$/i);
const routeSchema = z.object({
  site: objectId,
  name: z.string().min(2).max(120),
  description: z.string().max(1000).optional(),
  checkpoints: z
    .array(
      z.object({
        checkpoint: objectId,
        optional: z.boolean().optional(),
        expectedOffsetMinutes: z.number().min(0).max(24 * 60).nullable().optional(),
        expectedWindowMinutes: z.number().min(1).max(24 * 60).nullable().optional(),
      })
    )
    .min(1, 'Au moins un point de contrôle'),
  strictOrder: z.boolean().optional(),
  expectedDurationMinutes: z.number().min(1).max(24 * 60).optional(),
  active: z.boolean().optional(),
});

async function normalizeCheckpoints(orgId, siteId, list) {
  const ids = list.map((c) => c.checkpoint);
  const valid = await Checkpoint.countDocuments({ _id: { $in: ids }, site: siteId, organization: orgId });
  if (valid !== new Set(ids).size) throw badRequest('Tous les points doivent appartenir au site du parcours');
  return list.map((c, i) => ({
    checkpoint: c.checkpoint,
    order: i + 1,
    optional: !!c.optional,
    expectedOffsetMinutes: c.expectedOffsetMinutes ?? null,
    expectedWindowMinutes: c.expectedWindowMinutes ?? null,
  }));
}

router.get(
  '/',
  requireRole(...STAFF_ROLES, ROLES.AGENT),
  asyncHandler(async (req, res) => {
    const filter = { organization: req.orgId };
    if (req.query.site) filter.site = req.query.site;
    if (req.query.active !== undefined) filter.active = req.query.active === 'true';
    if (req.user.role === ROLES.AGENT) {
      filter.active = true;
      if (req.user.sites?.length) filter.site = { $in: req.user.sites };
    }
    const items = await Route.find(filter)
      .populate('site', 'name code')
      .populate('checkpoints.checkpoint', 'name code')
      .sort({ name: 1 });
    res.json({ items });
  })
);

router.get(
  '/:id',
  requireRole(...STAFF_ROLES, ROLES.AGENT),
  asyncHandler(async (req, res) => {
    const route = await Route.findOne({ _id: req.params.id, organization: req.orgId })
      .populate('site', 'name code location')
      .populate('checkpoints.checkpoint', 'name code location radius');
    if (!route) throw notFound('Parcours introuvable');
    res.json({ route });
  })
);

router.post(
  '/',
  requireRole(...ADMIN_ROLES),
  validate(routeSchema),
  asyncHandler(async (req, res) => {
    const site = await Site.findOne({ _id: req.body.site, organization: req.orgId });
    if (!site) throw badRequest('Site invalide');
    const checkpoints = await normalizeCheckpoints(req.orgId, site._id, req.body.checkpoints);
    const route = await Route.create({ ...req.body, checkpoints, organization: req.orgId });
    audit(req, 'route.created', 'Route', route._id, { name: route.name });
    res.status(201).json({ route });
  })
);

router.patch(
  '/:id',
  requireRole(...ADMIN_ROLES),
  validate(routeSchema.omit({ site: true }).partial()),
  asyncHandler(async (req, res) => {
    const route = await Route.findOne({ _id: req.params.id, organization: req.orgId });
    if (!route) throw notFound('Parcours introuvable');
    const { checkpoints, ...rest } = req.body;
    Object.assign(route, rest);
    if (checkpoints) route.checkpoints = await normalizeCheckpoints(req.orgId, route.site, checkpoints);
    await route.save();
    audit(req, 'route.updated', 'Route', route._id, req.body);
    res.json({ route });
  })
);

router.delete(
  '/:id',
  requireRole(...ADMIN_ROLES),
  asyncHandler(async (req, res) => {
    const route = await Route.findOneAndUpdate({ _id: req.params.id, organization: req.orgId }, { active: false });
    if (!route) throw notFound('Parcours introuvable');
    audit(req, 'route.deactivated', 'Route', route._id);
    res.json({ ok: true });
  })
);

module.exports = router;
