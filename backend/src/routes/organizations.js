const router = require('express').Router();
const { z } = require('zod');
const { Organization, User } = require('../models');
const { requireRole, requireOrg } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { asyncHandler, notFound } = require('../utils/http');
const { ROLES } = require('../utils/constants');
const { audit } = require('../services/audit');

const settingsSchema = z
  .object({
    defaultCheckpointRadius: z.number().min(5).max(1000),
    maxGpsAccuracy: z.number().min(5).max(500),
    duplicateScanMinutes: z.number().min(0).max(120),
    maxWalkingSpeed: z.number().min(1).max(60),
    maxClockSkewMinutes: z.number().min(1).max(120),
    offlineScanMaxHours: z.number().min(1).max(168),
    enforceDeviceBinding: z.boolean(),
    rejectMockLocation: z.boolean(),
    lateToleranceMinutes: z.number().min(0).max(240),
    positionPingSeconds: z.number().min(15).max(900),
    alertOnSuspiciousScan: z.boolean(),
    alertOnLatePatrol: z.boolean(),
  })
  .partial();

const orgSchema = z.object({
  name: z.string().min(2).max(120),
  code: z.string().min(2).max(20).regex(/^[A-Za-z0-9_-]+$/),
  contactEmail: z.string().email().optional().or(z.literal('')),
  contactPhone: z.string().max(40).optional(),
  address: z.string().max(300).optional(),
  logoUrl: z.string().url().optional().or(z.literal('')),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  active: z.boolean().optional(),
  settings: settingsSchema.optional(),
});

// --- Société courante (admin client) ---------------------------------------
router.get(
  '/current',
  requireOrg,
  asyncHandler(async (req, res) => {
    const org = await Organization.findById(req.orgId);
    if (!org) throw notFound();
    res.json({ organization: org });
  })
);

router.patch(
  '/current',
  requireOrg,
  requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN),
  validate(orgSchema.omit({ code: true, active: true }).partial()),
  asyncHandler(async (req, res) => {
    const org = await Organization.findById(req.orgId);
    if (!org) throw notFound();
    const { settings, ...rest } = req.body;
    Object.assign(org, rest);
    if (settings) org.set('settings', { ...(org.toObject().settings || {}), ...settings });
    await org.save();
    audit(req, 'organization.updated', 'Organization', org._id, req.body);
    res.json({ organization: org });
  })
);

// --- Gestion multi-sociétés (super admin plateforme) ----------------------
router.get(
  '/',
  requireRole(ROLES.SUPER_ADMIN),
  asyncHandler(async (_req, res) => {
    const orgs = await Organization.find().sort({ name: 1 });
    const counts = await User.aggregate([{ $group: { _id: '$organization', n: { $sum: 1 } } }]);
    const map = new Map(counts.map((c) => [String(c._id), c.n]));
    res.json({ items: orgs.map((o) => ({ ...o.toJSON(), usersCount: map.get(String(o._id)) || 0 })) });
  })
);

router.post(
  '/',
  requireRole(ROLES.SUPER_ADMIN),
  validate(
    orgSchema.extend({
      admin: z
        .object({
          firstName: z.string().min(1),
          lastName: z.string().min(1),
          email: z.string().email(),
          password: z.string().min(8),
        })
        .optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const { admin, ...data } = req.body;
    const org = await Organization.create({ ...data, code: data.code.toUpperCase() });
    let adminUser = null;
    if (admin) {
      adminUser = new User({ ...admin, organization: org._id, role: ROLES.ADMIN });
      await adminUser.setPassword(admin.password);
      await adminUser.save();
    }
    audit(req, 'organization.created', 'Organization', org._id, { name: org.name });
    res.status(201).json({ organization: org, admin: adminUser });
  })
);

router.patch(
  '/:id',
  requireRole(ROLES.SUPER_ADMIN),
  validate(orgSchema.partial()),
  asyncHandler(async (req, res) => {
    const org = await Organization.findById(req.params.id);
    if (!org) throw notFound();
    const { settings, ...rest } = req.body;
    Object.assign(org, rest);
    if (settings) org.set('settings', { ...(org.toObject().settings || {}), ...settings });
    await org.save();
    audit(req, 'organization.updated', 'Organization', org._id, req.body);
    res.json({ organization: org });
  })
);

module.exports = router;
