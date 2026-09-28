const router = require('express').Router();
const { z } = require('zod');
const { Team, User } = require('../models');
const { requireRole, requireOrg } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { asyncHandler, notFound, badRequest } = require('../utils/http');
const { ADMIN_ROLES, STAFF_ROLES } = require('../utils/constants');

router.use(requireOrg);
const objectId = z.string().regex(/^[a-f0-9]{24}$/i);
const teamSchema = z.object({
  name: z.string().min(2).max(80),
  callSign: z.string().max(40).optional(),
  vehicle: z.string().max(80).optional(),
  phone: z.string().max(40).optional(),
  leader: objectId.nullable().optional(),
  members: z.array(objectId).default([]),
  sites: z.array(objectId).default([]),
  available: z.boolean().optional(),
  active: z.boolean().optional(),
});

async function checkMembers(orgId, ids = []) {
  if (!ids.length) return;
  const n = await User.countDocuments({ _id: { $in: ids }, organization: orgId });
  if (n !== ids.length) throw badRequest('Membre invalide');
}

router.get(
  '/',
  requireRole(...STAFF_ROLES),
  asyncHandler(async (req, res) => {
    const items = await Team.find({ organization: req.orgId, active: true })
      .populate('members', 'firstName lastName phone onDuty lastPosition lastSeenAt')
      .populate('leader', 'firstName lastName')
      .populate('sites', 'name')
      .sort({ name: 1 });
    res.json({ items });
  })
);

router.post(
  '/',
  requireRole(...ADMIN_ROLES),
  validate(teamSchema),
  asyncHandler(async (req, res) => {
    await checkMembers(req.orgId, req.body.members);
    const team = await Team.create({ ...req.body, organization: req.orgId });
    await User.updateMany({ _id: { $in: team.members } }, { team: team._id });
    res.status(201).json({ team });
  })
);

router.patch(
  '/:id',
  requireRole(...STAFF_ROLES),
  validate(teamSchema.partial()),
  asyncHandler(async (req, res) => {
    const team = await Team.findOne({ _id: req.params.id, organization: req.orgId });
    if (!team) throw notFound('Équipe introuvable');
    await checkMembers(req.orgId, req.body.members);
    Object.assign(team, req.body);
    await team.save();
    if (req.body.members) {
      await User.updateMany({ team: team._id, _id: { $nin: team.members } }, { $unset: { team: 1 } });
      await User.updateMany({ _id: { $in: team.members } }, { team: team._id });
    }
    res.json({ team });
  })
);

router.delete(
  '/:id',
  requireRole(...ADMIN_ROLES),
  asyncHandler(async (req, res) => {
    const team = await Team.findOneAndUpdate({ _id: req.params.id, organization: req.orgId }, { active: false });
    if (!team) throw notFound('Équipe introuvable');
    res.json({ ok: true });
  })
);

module.exports = router;
