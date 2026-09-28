const { AuditLog } = require('../models');

function audit(req, action, entity, entityId, details) {
  return AuditLog.create({
    organization: req.orgId || req.user?.organization,
    user: req.user?._id,
    action,
    entity,
    entityId,
    details,
    ip: req.ip,
  }).catch((e) => console.warn('[audit]', e.message));
}

module.exports = { audit };
