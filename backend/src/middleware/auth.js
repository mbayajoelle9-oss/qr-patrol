const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const config = require('../config');
const { User } = require('../models');
const { unauthorized, forbidden, badRequest } = require('../utils/http');
const { ROLES } = require('../utils/constants');

function signToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role, org: user.organization?.toString() || null, v: user.tokenVersion },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

async function userFromToken(token) {
  const payload = jwt.verify(token, config.jwtSecret);
  const user = await User.findById(payload.sub);
  if (!user || !user.active || user.tokenVersion !== payload.v) return null;
  return user;
}

/** Exige un JWT valide. Remplit req.user et req.orgId. */
async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw unauthorized();
    const user = await userFromToken(token).catch(() => null);
    if (!user) throw unauthorized('Session expirée, veuillez vous reconnecter');
    req.user = user;

    // Le super admin peut agir sur une société via l'entête X-Org-Id
    if (user.role === ROLES.SUPER_ADMIN) {
      const requested = req.headers['x-org-id'];
      if (requested) {
        if (!mongoose.isValidObjectId(requested)) throw badRequest('X-Org-Id invalide');
        req.orgId = new mongoose.Types.ObjectId(String(requested));
      } else {
        req.orgId = null;
      }
    } else {
      if (!user.organization) throw forbidden('Utilisateur sans société');
      req.orgId = user.organization;
    }
    next();
  } catch (e) {
    next(e);
  }
}

/** Restreint aux rôles donnés. */
const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };

/** Exige qu'une société soit sélectionnée (utile pour le super admin). */
function requireOrg(req, _res, next) {
  if (!req.orgId) return next(badRequest('Sélectionnez une société (X-Org-Id)'));
  next();
}

module.exports = { signToken, userFromToken, requireAuth, requireRole, requireOrg };
