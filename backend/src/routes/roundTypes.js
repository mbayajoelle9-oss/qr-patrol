const router = require('express').Router();
const { z } = require('zod');
const { RoundType, Schedule, Patrol } = require('../models');
const { requireRole, requireOrg } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { asyncHandler, notFound, badRequest } = require('../utils/http');
const { ADMIN_ROLES, STAFF_ROLES } = require('../utils/constants');
const { audit } = require('../services/audit');

router.use(requireOrg);

const roundTypeSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(500).optional(),
  color: z.string().max(20).optional(),
  defaultDurationMinutes: z.number().int().min(1).max(24 * 60).optional(),
  requireBiometric: z.boolean().optional(),
  active: z.boolean().optional(),
});

router.get(
  '/',
  requireRole(...STAFF_ROLES),
  asyncHandler(async (req, res) => {
    const filter = { organization: req.orgId };
    if (req.query.active !== undefined) filter.active = req.query.active === 'true';
    const items = await RoundType.find(filter).sort({ name: 1 });
    res.json({ items });
  })
);

router.post(
  '/',
  requireRole(...ADMIN_ROLES),
  validate(roundTypeSchema),
  asyncHandler(async (req, res) => {
    const rt = await RoundType.create({ ...req.body, organization: req.orgId });
    audit(req, 'round_type.created', 'RoundType', rt._id);
    res.status(201).json({ roundType: rt });
  })
);

router.patch(
  '/:id',
  requireRole(...ADMIN_ROLES),
  validate(roundTypeSchema.partial()),
  asyncHandler(async (req, res) => {
    const rt = await RoundType.findOne({ _id: req.params.id, organization: req.orgId });
    if (!rt) throw notFound('Type de ronde introuvable');
    Object.assign(rt, req.body);
    await rt.save();
    audit(req, 'round_type.updated', 'RoundType', rt._id, req.body);
    res.json({ roundType: rt });
  })
);

router.delete(
  '/:id',
  requireRole(...ADMIN_ROLES),
  asyncHandler(async (req, res) => {
    const inUse = await Promise.all([
      Schedule.exists({ roundType: req.params.id, organization: req.orgId }),
      Patrol.exists({ roundType: req.params.id, organization: req.orgId }),
    ]);
    if (inUse.some(Boolean)) throw badRequest('Ce type de ronde est utilisé — désactivez-le plutôt que de le supprimer');
    const rt = await RoundType.findOneAndDelete({ _id: req.params.id, organization: req.orgId });
    if (!rt) throw notFound('Type de ronde introuvable');
    audit(req, 'round_type.deleted', 'RoundType', rt._id);
    res.json({ ok: true });
  })
);

module.exports = router;
