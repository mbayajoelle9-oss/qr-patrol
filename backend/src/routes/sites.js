const router = require('express').Router();
const { z } = require('zod');
const { Site, Checkpoint, Route } = require('../models');
const { requireRole, requireOrg } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { asyncHandler, notFound, escapeRegex } = require('../utils/http');
const { ADMIN_ROLES, STAFF_ROLES, ROLES } = require('../utils/constants');
const { latLngToPoint } = require('../utils/geo');
const { audit } = require('../services/audit');

router.use(requireOrg);

const siteSchema = z.object({
  name: z.string().min(2).max(120),
  code: z.string().max(20).optional(),
  client: z.string().max(120).optional(),
  address: z.string().max(300).optional(),
  city: z.string().max(80).optional(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  geofenceRadius: z.number().min(20).max(20000).optional(),
  contactName: z.string().max(120).optional(),
  contactPhone: z.string().max(40).optional(),
  instructions: z.string().max(4000).optional(),
  active: z.boolean().optional(),
});

function apply(site, body) {
  const { lat, lng, ...rest } = body;
  Object.assign(site, rest);
  if (lat !== undefined || lng !== undefined) site.location = lat != null && lng != null ? latLngToPoint(lat, lng) : undefined;
}

router.get(
  '/',
  requireRole(...STAFF_ROLES, ROLES.AGENT, ROLES.RESPONDER),
  asyncHandler(async (req, res) => {
    const filter = { organization: req.orgId };
    if (req.query.active !== undefined) filter.active = req.query.active === 'true';
    if (req.query.q) filter.name = new RegExp(escapeRegex(req.query.q), 'i');
    // Un agent ne voit que ses sites
    if ([ROLES.AGENT, ROLES.RESPONDER].includes(req.user.role) && req.user.sites?.length) filter._id = { $in: req.user.sites };
    const sites = await Site.find(filter).sort({ name: 1 });
    const counts = await Checkpoint.aggregate([
      { $match: { organization: req.orgId, active: true } },
      { $group: { _id: '$site', n: { $sum: 1 } } },
    ]);
    const map = new Map(counts.map((c) => [String(c._id), c.n]));
    res.json({ items: sites.map((s) => ({ ...s.toJSON(), checkpointsCount: map.get(String(s._id)) || 0 })) });
  })
);

router.get(
  '/:id',
  requireRole(...STAFF_ROLES, ROLES.AGENT, ROLES.RESPONDER),
  asyncHandler(async (req, res) => {
    const site = await Site.findOne({ _id: req.params.id, organization: req.orgId });
    if (!site) throw notFound('Site introuvable');
    const [checkpoints, routes] = await Promise.all([
      Checkpoint.find({ site: site._id }).sort({ code: 1, name: 1 }),
      Route.find({ site: site._id }).sort({ name: 1 }),
    ]);
    res.json({ site, checkpoints, routes });
  })
);

router.post(
  '/',
  requireRole(...ADMIN_ROLES),
  validate(siteSchema),
  asyncHandler(async (req, res) => {
    const site = new Site({ organization: req.orgId });
    apply(site, req.body);
    await site.save();
    audit(req, 'site.created', 'Site', site._id, { name: site.name });
    res.status(201).json({ site });
  })
);

router.patch(
  '/:id',
  requireRole(...ADMIN_ROLES),
  validate(siteSchema.partial()),
  asyncHandler(async (req, res) => {
    const site = await Site.findOne({ _id: req.params.id, organization: req.orgId });
    if (!site) throw notFound('Site introuvable');
    apply(site, req.body);
    await site.save();
    audit(req, 'site.updated', 'Site', site._id, req.body);
    res.json({ site });
  })
);

// Suppression logique (l'historique reste consultable)
router.delete(
  '/:id',
  requireRole(...ADMIN_ROLES),
  asyncHandler(async (req, res) => {
    const site = await Site.findOneAndUpdate({ _id: req.params.id, organization: req.orgId }, { active: false }, { new: true });
    if (!site) throw notFound('Site introuvable');
    await Checkpoint.updateMany({ site: site._id }, { active: false });
    await Route.updateMany({ site: site._id }, { active: false });
    audit(req, 'site.deactivated', 'Site', site._id);
    res.json({ ok: true });
  })
);

module.exports = router;
