const router = require('express').Router();
const { AuditLog } = require('../models');
const { requireRole, requireOrg } = require('../middleware/auth');
const { asyncHandler, paginate } = require('../utils/http');
const { ADMIN_ROLES } = require('../utils/constants');

router.use(requireOrg, requireRole(...ADMIN_ROLES));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { limit, skip } = paginate(req);
    const filter = { organization: req.orgId };
    if (req.query.action) filter.action = new RegExp(`^${String(req.query.action).replace(/[^a-z_.]/gi, '')}`);
    const [items, total] = await Promise.all([
      AuditLog.find(filter).populate('user', 'firstName lastName role').sort({ createdAt: -1 }).skip(skip).limit(limit),
      AuditLog.countDocuments(filter),
    ]);
    res.json({ items, total });
  })
);

module.exports = router;
