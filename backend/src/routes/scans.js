const router = require('express').Router();
const { z } = require('zod');
const { ScanEvent, Media } = require('../models');
const { requireRole, requireOrg } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { asyncHandler, notFound, paginate } = require('../utils/http');
const { STAFF_ROLES, ROLES, FLAG_LABELS } = require('../utils/constants');
const { recordScan } = require('../services/scans');
const { withUrls } = require('../services/media');
const { toCentrale } = require('../services/realtime');
const { audit } = require('../services/audit');

router.use(requireOrg);

const objectId = z.string().regex(/^[a-f0-9]{24}$/i);
const locationSchema = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    accuracy: z.number().min(0).max(100000).nullable().optional(),
    altitude: z.number().nullable().optional(),
    speed: z.number().nullable().optional(),
    heading: z.number().nullable().optional(),
    mocked: z.boolean().optional(),
    capturedAt: z.coerce.date().optional(),
  })
  .nullable()
  .optional();

const scanSchema = z.object({
  payload: z.string().min(1).max(500),
  scannedAt: z.coerce.date().optional(),
  clientId: z.string().max(80).optional(),
  offline: z.boolean().optional(),
  patrolId: objectId.optional(),
  location: locationSchema,
  device: z
    .object({
      deviceId: z.string().max(200),
      model: z.string().max(100).optional(),
      os: z.string().max(40).optional(),
      osVersion: z.string().max(40).optional(),
      appVersion: z.string().max(40).optional(),
    })
    .optional(),
  comment: z.string().max(1000).optional(),
  photoMediaId: objectId.optional(),
});

// Scan d'un point de contrôle
router.post(
  '/',
  requireRole(ROLES.AGENT, ROLES.RESPONDER),
  validate(scanSchema),
  asyncHandler(async (req, res) => {
    const result = await recordScan(req.user, req.body);
    res.status(result.replayed ? 200 : 201).json(result);
  })
);

// Synchronisation des scans enregistrés hors-ligne (ordre chronologique)
router.post(
  '/batch',
  requireRole(ROLES.AGENT, ROLES.RESPONDER),
  validate(z.object({ scans: z.array(scanSchema).min(1).max(200) })),
  asyncHandler(async (req, res) => {
    const sorted = [...req.body.scans].sort((a, b) => new Date(a.scannedAt || 0) - new Date(b.scannedAt || 0));
    const results = [];
    for (const s of sorted) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const r = await recordScan(req.user, { ...s, offline: true });
        results.push({ clientId: s.clientId, ok: true, status: r.status, message: r.message });
      } catch (e) {
        results.push({ clientId: s.clientId, ok: false, error: e.message });
      }
    }
    res.json({ results });
  })
);

// Photo de preuve ajoutée après le scan (points exigeant une photo)
router.post(
  '/:id/photo',
  requireRole(ROLES.AGENT, ROLES.RESPONDER),
  validate(z.object({ mediaId: objectId })),
  asyncHandler(async (req, res) => {
    const scan = await ScanEvent.findOne({ _id: req.params.id, agent: req.user._id });
    if (!scan) throw notFound('Scan introuvable');
    const media = await Media.findOne({ _id: req.body.mediaId, organization: req.orgId, uploadedBy: req.user._id });
    if (!media) throw notFound('Photo introuvable');
    scan.photo = media._id;
    await scan.save();
    toCentrale(req.orgId, 'scan:photo', { scanId: scan.id });
    res.json({ ok: true });
  })
);

// Historique
router.get(
  '/',
  requireRole(...STAFF_ROLES, ROLES.AGENT),
  asyncHandler(async (req, res) => {
    const { limit, skip } = paginate(req);
    const filter = { organization: req.orgId };
    if (req.user.role === ROLES.AGENT) filter.agent = req.user._id;
    else if (req.query.agent) filter.agent = req.query.agent;
    if (req.query.site) filter.site = req.query.site;
    if (req.query.patrol) filter.patrol = req.query.patrol;
    if (req.query.checkpoint) filter.checkpoint = req.query.checkpoint;
    if (req.query.status) filter.status = { $in: String(req.query.status).split(',') };
    if (req.query.reviewed === 'false') filter['reviewed.at'] = null;
    if (req.query.from || req.query.to) {
      filter.scannedAt = {};
      if (req.query.from) filter.scannedAt.$gte = new Date(req.query.from);
      if (req.query.to) filter.scannedAt.$lte = new Date(req.query.to);
    }
    const [items, total] = await Promise.all([
      ScanEvent.find(filter)
        .populate([
          { path: 'agent', select: 'firstName lastName matricule' },
          { path: 'checkpoint', select: 'name code location radius' },
          { path: 'site', select: 'name code' },
          { path: 'photo' },
        ])
        .sort({ scannedAt: -1 })
        .skip(skip)
        .limit(limit),
      ScanEvent.countDocuments(filter),
    ]);
    res.json({
      items: items.map((s) => {
        const j = s.toJSON();
        j.flagLabels = (j.flags || []).map((f) => FLAG_LABELS[f] || f);
        if (s.photo) j.photo = withUrls([s.photo])[0];
        return j;
      }),
      total,
    });
  })
);

// Revue d'un scan suspect par la centrale
router.patch(
  '/:id/review',
  requireRole(...STAFF_ROLES),
  validate(z.object({ decision: z.enum(['accepted', 'rejected']), note: z.string().max(1000).optional() })),
  asyncHandler(async (req, res) => {
    const scan = await ScanEvent.findOne({ _id: req.params.id, organization: req.orgId });
    if (!scan) throw notFound('Scan introuvable');
    scan.reviewed = { by: req.user._id, at: new Date(), decision: req.body.decision, note: req.body.note };
    await scan.save();
    audit(req, 'scan.reviewed', 'ScanEvent', scan._id, req.body);
    toCentrale(req.orgId, 'scan:reviewed', scan.toJSON());
    res.json({ scan });
  })
);

module.exports = router;
