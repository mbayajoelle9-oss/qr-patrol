const router = require('express').Router();
const { Alert } = require('../models');
const { requireRole, requireOrg } = require('../middleware/auth');
const { asyncHandler, notFound, paginate } = require('../utils/http');
const { STAFF_ROLES } = require('../utils/constants');
const { toCentrale } = require('../services/realtime');

router.use(requireOrg, requireRole(...STAFF_ROLES));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { limit, skip } = paginate(req);
    const filter = { organization: req.orgId };
    if (req.query.acknowledged !== undefined) filter.acknowledged = req.query.acknowledged === 'true';
    if (req.query.type) filter.type = { $in: String(req.query.type).split(',') };
    const [items, total, unread] = await Promise.all([
      Alert.find(filter)
        .populate('agent', 'firstName lastName matricule')
        .populate('site', 'name code')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Alert.countDocuments(filter),
      Alert.countDocuments({ organization: req.orgId, acknowledged: false }),
    ]);
    res.json({ items, total, unread });
  })
);

router.post(
  '/:id/ack',
  asyncHandler(async (req, res) => {
    const alert = await Alert.findOneAndUpdate(
      { _id: req.params.id, organization: req.orgId },
      { acknowledged: true, acknowledgedBy: req.user._id, acknowledgedAt: new Date() },
      { new: true }
    );
    if (!alert) throw notFound('Alerte introuvable');
    toCentrale(req.orgId, 'alert:ack', { id: alert.id });
    res.json({ alert });
  })
);

router.post(
  '/ack-all',
  asyncHandler(async (req, res) => {
    const r = await Alert.updateMany(
      { organization: req.orgId, acknowledged: false, type: { $ne: 'sos' } },
      { acknowledged: true, acknowledgedBy: req.user._id, acknowledgedAt: new Date() }
    );
    toCentrale(req.orgId, 'alert:ack', { all: true });
    res.json({ updated: r.modifiedCount });
  })
);

module.exports = router;
