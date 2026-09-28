const router = require('express').Router();
const { z } = require('zod');
const { Intervention } = require('../models');
const { requireRole, requireOrg } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { asyncHandler, notFound, forbidden, paginate } = require('../utils/http');
const { STAFF_ROLES, ROLES, INTERVENTION_STATUS } = require('../utils/constants');
const svc = require('../services/incidents');

router.use(requireOrg);

const POP = [
  { path: 'team', select: 'name callSign vehicle phone' },
  { path: 'members', select: 'firstName lastName phone' },
  { path: 'dispatchedBy', select: 'firstName lastName' },
  {
    path: 'incident',
    select: 'reference type severity status title location site reportedBy createdAt',
    populate: [
      { path: 'site', select: 'name address location' },
      { path: 'reportedBy', select: 'firstName lastName phone' },
    ],
  },
];

router.get(
  '/',
  requireRole(...STAFF_ROLES, ROLES.RESPONDER, ROLES.AGENT),
  asyncHandler(async (req, res) => {
    const { limit, skip } = paginate(req);
    const filter = { organization: req.orgId };
    if (!STAFF_ROLES.includes(req.user.role)) filter.members = req.user._id;
    if (req.query.status === 'active') filter.status = { $in: ['dispatched', 'en_route', 'on_site'] };
    else if (req.query.status) filter.status = { $in: String(req.query.status).split(',') };
    if (req.query.incident) filter.incident = req.query.incident;
    const [items, total] = await Promise.all([
      Intervention.find(filter).populate(POP).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Intervention.countDocuments(filter),
    ]);
    res.json({ items, total });
  })
);

router.patch(
  '/:id',
  requireRole(...STAFF_ROLES, ROLES.RESPONDER, ROLES.AGENT),
  validate(z.object({ status: z.enum(INTERVENTION_STATUS).optional(), report: z.string().max(5000).optional() })),
  asyncHandler(async (req, res) => {
    const iv = await Intervention.findOne({ _id: req.params.id, organization: req.orgId });
    if (!iv) throw notFound('Intervention introuvable');
    if (!STAFF_ROLES.includes(req.user.role) && !iv.members.map(String).includes(String(req.user._id))) throw forbidden();
    const updated = await svc.updateIntervention(req.user, iv, req.body);
    res.json({ intervention: updated });
  })
);

module.exports = router;
