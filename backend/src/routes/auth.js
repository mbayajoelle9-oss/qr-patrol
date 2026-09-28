const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { User, Organization } = require('../models');
const { signToken, requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { asyncHandler, unauthorized, forbidden, badRequest } = require('../utils/http');
const { ROLES } = require('../utils/constants');
const { raiseAlert } = require('../services/alerts');
const { escapeRegex } = require('../utils/http');

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });

const deviceSchema = z
  .object({
    deviceId: z.string().min(3).max(200),
    model: z.string().max(100).optional(),
    os: z.string().max(40).optional(),
    osVersion: z.string().max(40).optional(),
    appVersion: z.string().max(40).optional(),
  })
  .optional();

const loginSchema = z.object({
  identifier: z.string().min(2).max(120), // e-mail, matricule ou téléphone
  password: z.string().min(4).max(200),
  orgCode: z.string().max(40).optional(), // utile si un matricule existe dans plusieurs sociétés
  client: z.enum(['web', 'mobile']).default('web'),
  device: deviceSchema,
  pushToken: z.string().max(300).optional(),
});

function publicUser(u, org) {
  const json = u.toJSON();
  return {
    ...json,
    organization: org
      ? { id: org._id, name: org.name, code: org.code, logoUrl: org.logoUrl, primaryColor: org.primaryColor, settings: org.settings }
      : null,
  };
}

router.post(
  '/login',
  loginLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { identifier, password, orgCode, client, device, pushToken } = req.body;
    const id = identifier.trim();
    const or = [{ email: id.toLowerCase() }, { matricule: id.toUpperCase() }, { phone: id }];
    const filter = { $or: or, active: true };
    if (orgCode) {
      const org = await Organization.findOne({ code: orgCode.toUpperCase() });
      if (!org) throw unauthorized('Identifiants incorrects');
      filter.organization = org._id;
    }
    const candidates = await User.find(filter).limit(5);
    let user = null;
    for (const c of candidates) {
      // eslint-disable-next-line no-await-in-loop
      if (await c.checkPassword(password)) {
        user = c;
        break;
      }
    }
    if (!user) throw unauthorized('Identifiants incorrects');

    let org = null;
    if (user.organization) {
      org = await Organization.findById(user.organization);
      if (!org || !org.active) throw forbidden('Société désactivée');
    }

    // Le web est réservé à la centrale et à l'administration
    if (client === 'web' && [ROLES.AGENT].includes(user.role)) {
      throw forbidden('Les agents utilisent l’application mobile');
    }

    // Liaison téléphone ↔ agent (anti-fraude)
    if (client === 'mobile' && [ROLES.AGENT, ROLES.RESPONDER].includes(user.role)) {
      if (!device?.deviceId) throw badRequest('Identifiant du téléphone manquant');
      const enforce = org?.settings?.enforceDeviceBinding !== false;
      if (!user.boundDevice?.deviceId) {
        user.boundDevice = device;
      } else if (user.boundDevice.deviceId !== device.deviceId) {
        await raiseAlert({
          organization: user.organization,
          type: 'device_change',
          level: 'warning',
          title: 'Connexion depuis un autre téléphone',
          message: `${user.firstName} ${user.lastName} tente de se connecter depuis ${device.model || 'un appareil inconnu'}`,
          agent: user._id,
        });
        if (enforce) {
          throw forbidden('Ce téléphone n’est pas autorisé pour votre compte. Contactez votre superviseur.');
        }
        user.boundDevice = device;
      }
    }

    if (pushToken) user.pushToken = pushToken;
    user.lastLoginAt = new Date();
    await user.save();

    res.json({ token: signToken(user), user: publicUser(user, org) });
  })
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const org = req.user.organization ? await Organization.findById(req.user.organization) : null;
    await req.user.populate({ path: 'sites', select: 'name code address location' });
    res.json({ user: publicUser(req.user, org) });
  })
);

router.post(
  '/push-token',
  requireAuth,
  validate(z.object({ pushToken: z.string().max(300).nullable() })),
  asyncHandler(async (req, res) => {
    req.user.pushToken = req.body.pushToken || undefined;
    await req.user.save();
    res.json({ ok: true });
  })
);

router.post(
  '/change-password',
  requireAuth,
  validate(z.object({ currentPassword: z.string(), newPassword: z.string().min(8).max(200) })),
  asyncHandler(async (req, res) => {
    if (!(await req.user.checkPassword(req.body.currentPassword))) throw badRequest('Mot de passe actuel incorrect');
    await req.user.setPassword(req.body.newPassword);
    req.user.tokenVersion += 1; // déconnecte les autres sessions
    await req.user.save();
    res.json({ token: signToken(req.user) });
  })
);

router.post(
  '/logout-all',
  requireAuth,
  asyncHandler(async (req, res) => {
    req.user.tokenVersion += 1;
    req.user.pushToken = undefined;
    await req.user.save();
    res.json({ ok: true });
  })
);

// Recherche utilitaire pour l'écran de connexion (nom de la société à partir du code)
router.get(
  '/org/:code',
  asyncHandler(async (req, res) => {
    const org = await Organization.findOne({ code: new RegExp(`^${escapeRegex(req.params.code)}$`, 'i'), active: true }).select(
      'name code logoUrl primaryColor'
    );
    res.json({ organization: org });
  })
);

module.exports = router;
