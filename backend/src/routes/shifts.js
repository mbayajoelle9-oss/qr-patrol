const router = require('express').Router();
const { z } = require('zod');
const { Shift, User, Site } = require('../models');
const { requireRole, requireOrg } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { asyncHandler, notFound, badRequest } = require('../utils/http');
const { ADMIN_ROLES, STAFF_ROLES, ROLES } = require('../utils/constants');
const { audit } = require('../services/audit');

router.use(requireOrg);

const objectId = z.string().regex(/^[a-f0-9]{24}$/i);
const hhmm = z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'Format HH:mm');

const shiftSchema = z.object({
  site: objectId,
  name: z.string().min(1).max(80),
  startTime: hhmm,
  endTime: hhmm,
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).default([0, 1, 2, 3, 4, 5, 6]),
  rondiers: z.array(objectId).default([]),
  active: z.boolean().optional(),
});

async function check(orgId, body) {
  const site = await Site.findOne({ _id: body.site, organization: orgId });
  if (!site) throw badRequest('Site invalide');
  if (body.rondiers?.length) {
    const n = await User.countDocuments({ _id: { $in: body.rondiers }, organization: orgId, role: ROLES.AGENT });
    if (n !== body.rondiers.length) throw badRequest('Rondier invalide');
  }
}

router.get(
  '/',
  requireRole(...STAFF_ROLES),
  asyncHandler(async (req, res) => {
    const filter = { organization: req.orgId };
    if (req.query.site) filter.site = req.query.site;
    const items = await Shift.find(filter)
      .populate('site', 'name code')
      .populate('rondiers', 'firstName lastName matricule')
      .sort({ startTime: 1 });
    res.json({ items });
  })
);

router.post(
  '/',
  requireRole(...ADMIN_ROLES),
  validate(shiftSchema),
  asyncHandler(async (req, res) => {
    await check(req.orgId, req.body);
    const shift = await Shift.create({ ...req.body, organization: req.orgId });
    audit(req, 'shift.created', 'Shift', shift._id);
    res.status(201).json({ shift });
  })
);

router.patch(
  '/:id',
  requireRole(...ADMIN_ROLES),
  validate(shiftSchema.partial()),
  asyncHandler(async (req, res) => {
    const shift = await Shift.findOne({ _id: req.params.id, organization: req.orgId });
    if (!shift) throw notFound('Shift introuvable');
    await check(req.orgId, { site: req.body.site || shift.site, rondiers: req.body.rondiers });
    Object.assign(shift, req.body);
    await shift.save();
    audit(req, 'shift.updated', 'Shift', shift._id, req.body);
    res.json({ shift });
  })
);

router.delete(
  '/:id',
  requireRole(...ADMIN_ROLES),
  asyncHandler(async (req, res) => {
    const s = await Shift.findOneAndDelete({ _id: req.params.id, organization: req.orgId });
    if (!s) throw notFound('Shift introuvable');
    audit(req, 'shift.deleted', 'Shift', s._id);
    res.json({ ok: true });
  })
);

module.exports = router;
