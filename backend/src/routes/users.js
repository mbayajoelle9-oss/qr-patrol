const router = require('express').Router();
const crypto = require('crypto');
const { z } = require('zod');
const { User, Site, Patrol, Media } = require('../models');
const { requireRole, requireOrg } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { asyncHandler, notFound, forbidden, escapeRegex, paginate } = require('../utils/http');
const { ROLES, ADMIN_ROLES, STAFF_ROLES, PATROL_STATUS } = require('../utils/constants');
const { onlineUserIds, toCentrale } = require('../services/realtime');
const { withUrls } = require('../services/media');
const { audit } = require('../services/audit');

router.use(requireOrg);

const objectId = z.string().regex(/^[a-f0-9]{24}$/i);
const userSchema = z.object({
  role: z.enum([ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.AGENT, ROLES.RESPONDER]),
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(30).optional(),
  matricule: z.string().max(30).optional(),
  password: z.string().min(6).max(200).optional(),
  sites: z.array(objectId).optional(),
  team: objectId.nullable().optional(),
  active: z.boolean().optional(),
  photo: objectId.nullable().optional(),
});

/** Ajoute `photo.url` (lien signé) à un document User sérialisé. */
function withPhoto(json) {
  if (json.photo && typeof json.photo === 'object' && json.photo._id) {
    json.photo = withUrls([json.photo])[0];
  }
  return json;
}

// Liste
router.get(
  '/',
  requireRole(...STAFF_ROLES),
  asyncHandler(async (req, res) => {
    const { limit, skip } = paginate(req, { limit: 200 });
    const filter = { organization: req.orgId };
    if (req.query.role) filter.role = { $in: String(req.query.role).split(',') };
    if (req.query.site) filter.sites = req.query.site;
    if (req.query.active !== undefined) filter.active = req.query.active === 'true';
    if (req.query.onDuty !== undefined) filter.onDuty = req.query.onDuty === 'true';
    if (req.query.q) {
      const rx = new RegExp(escapeRegex(req.query.q), 'i');
      filter.$or = [{ firstName: rx }, { lastName: rx }, { matricule: rx }, { email: rx }, { phone: rx }];
    }
    const [items, total] = await Promise.all([
      User.find(filter)
        .populate('sites', 'name code')
        .populate('team', 'name')
        .populate('photo')
        .sort({ lastName: 1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(filter),
    ]);
    const online = onlineUserIds();
    res.json({ items: items.map((u) => ({ ...withPhoto(u.toJSON()), online: online.has(String(u._id)) })), total });
  })
);

router.get(
  '/:id',
  requireRole(...STAFF_ROLES),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ _id: req.params.id, organization: req.orgId })
      .populate('sites', 'name code')
      .populate('team', 'name')
      .populate('photo');
    if (!user) throw notFound('Utilisateur introuvable');
    const currentPatrol = await Patrol.findOne({ agent: user._id, status: PATROL_STATUS.IN_PROGRESS }).populate('route', 'name');
    res.json({ user: { ...withPhoto(user.toJSON()), online: onlineUserIds().has(String(user._id)) }, currentPatrol });
  })
);

async function checkSites(orgId, sites) {
  if (!sites?.length) return;
  const n = await Site.countDocuments({ _id: { $in: sites }, organization: orgId });
  if (n !== sites.length) throw forbidden('Site invalide');
}

async function checkPhoto(orgId, photoId) {
  if (!photoId) return;
  const ok = await Media.exists({ _id: photoId, organization: orgId });
  if (!ok) throw forbidden('Photo invalide');
}

// Création
router.post(
  '/',
  requireRole(...ADMIN_ROLES),
  validate(userSchema),
  asyncHandler(async (req, res) => {
    const { password, email, ...data } = req.body;
    await checkSites(req.orgId, data.sites);
    await checkPhoto(req.orgId, data.photo);
    const user = new User({ ...data, email: email || undefined, organization: req.orgId });
    // Mot de passe temporaire si non fourni (agents : code à 6 chiffres)
    const tempPassword = password || String(crypto.randomInt(100000, 999999));
    await user.setPassword(tempPassword);
    await user.save();
    audit(req, 'user.created', 'User', user._id, { role: user.role });
    res.status(201).json({ user, tempPassword: password ? undefined : tempPassword });
  })
);

// Mise à jour
router.patch(
  '/:id',
  requireRole(...ADMIN_ROLES),
  validate(userSchema.partial()),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ _id: req.params.id, organization: req.orgId });
    if (!user) throw notFound('Utilisateur introuvable');
    const { password, email, ...data } = req.body;
    await checkSites(req.orgId, data.sites);
    await checkPhoto(req.orgId, data.photo);
    Object.assign(user, data);
    if (email !== undefined) user.email = email || undefined;
    if (password) {
      await user.setPassword(password);
      user.tokenVersion += 1;
    }
    if (data.active === false) user.tokenVersion += 1;
    await user.save();
    audit(req, 'user.updated', 'User', user._id, { ...data, password: password ? '***' : undefined });
    res.json({ user });
  })
);

// Réinitialisation du mot de passe
router.post(
  '/:id/reset-password',
  requireRole(...ADMIN_ROLES),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ _id: req.params.id, organization: req.orgId });
    if (!user) throw notFound();
    const tempPassword = String(crypto.randomInt(100000, 999999));
    await user.setPassword(tempPassword);
    user.tokenVersion += 1;
    await user.save();
    audit(req, 'user.password_reset', 'User', user._id);
    res.json({ tempPassword });
  })
);

// Délier le téléphone (changement d'appareil autorisé)
router.post(
  '/:id/unbind-device',
  requireRole(...ADMIN_ROLES, ROLES.SUPERVISOR),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ _id: req.params.id, organization: req.orgId });
    if (!user) throw notFound();
    const previous = user.boundDevice?.model;
    user.boundDevice = undefined;
    user.tokenVersion += 1;
    await user.save();
    audit(req, 'user.device_unbound', 'User', user._id, { previous });
    res.json({ ok: true });
  })
);

// Forcer la fin de service
router.post(
  '/:id/end-duty',
  requireRole(...STAFF_ROLES),
  asyncHandler(async (req, res) => {
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, organization: req.orgId },
      { onDuty: false, dutyStartedAt: null },
      { new: true }
    );
    if (!user) throw notFound();
    toCentrale(req.orgId, 'agent:duty', { agentId: String(user._id), onDuty: false });
    res.json({ user });
  })
);

module.exports = router;
