const router = require('express').Router();
const crypto = require('crypto');
const { z } = require('zod');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');
const { Checkpoint, Site, Organization } = require('../models');
const { requireRole, requireOrg } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { asyncHandler, notFound, badRequest } = require('../utils/http');
const { ADMIN_ROLES, STAFF_ROLES } = require('../utils/constants');
const { latLngToPoint } = require('../utils/geo');
const { buildPayload } = require('../services/qr');
const { audit } = require('../services/audit');

router.use(requireOrg);

const objectId = z.string().regex(/^[a-f0-9]{24}$/i);
const cpSchema = z.object({
  site: objectId,
  name: z.string().min(1).max(120),
  code: z.string().max(20).optional(),
  description: z.string().max(1000).optional(),
  instructions: z.string().max(2000).optional(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  radius: z.number().min(5).max(2000).optional().nullable(),
  requireGps: z.boolean().optional(),
  requirePhoto: z.boolean().optional(),
  active: z.boolean().optional(),
});

function apply(cp, body) {
  const { lat, lng, ...rest } = body;
  Object.assign(cp, rest);
  if (lat !== undefined || lng !== undefined) cp.location = lat != null && lng != null ? latLngToPoint(lat, lng) : undefined;
}

router.get(
  '/',
  requireRole(...STAFF_ROLES),
  asyncHandler(async (req, res) => {
    const filter = { organization: req.orgId };
    if (req.query.site) filter.site = req.query.site;
    if (req.query.active !== undefined) filter.active = req.query.active === 'true';
    const items = await Checkpoint.find(filter).populate('site', 'name code').sort({ site: 1, code: 1, name: 1 });
    res.json({ items: items.map((c) => ({ ...c.toJSON(), qrPayload: buildPayload(c) })) });
  })
);

router.post(
  '/',
  requireRole(...ADMIN_ROLES),
  validate(cpSchema),
  asyncHandler(async (req, res) => {
    const site = await Site.findOne({ _id: req.body.site, organization: req.orgId });
    if (!site) throw badRequest('Site invalide');
    const cp = new Checkpoint({ organization: req.orgId });
    apply(cp, req.body);
    if (!cp.code) {
      const n = await Checkpoint.countDocuments({ site: site._id });
      cp.code = `P${String(n + 1).padStart(2, '0')}`;
    }
    await cp.save();
    audit(req, 'checkpoint.created', 'Checkpoint', cp._id, { name: cp.name });
    res.status(201).json({ checkpoint: { ...cp.toJSON(), qrPayload: buildPayload(cp) } });
  })
);

router.patch(
  '/:id',
  requireRole(...ADMIN_ROLES),
  validate(cpSchema.omit({ site: true }).partial()),
  asyncHandler(async (req, res) => {
    const cp = await Checkpoint.findOne({ _id: req.params.id, organization: req.orgId });
    if (!cp) throw notFound('Point introuvable');
    apply(cp, req.body);
    await cp.save();
    audit(req, 'checkpoint.updated', 'Checkpoint', cp._id, req.body);
    res.json({ checkpoint: { ...cp.toJSON(), qrPayload: buildPayload(cp) } });
  })
);

// Calibrage : enregistre la position actuelle du téléphone comme position du point
router.post(
  '/:id/calibrate',
  requireRole(...ADMIN_ROLES, 'supervisor'),
  validate(z.object({ lat: z.number(), lng: z.number(), accuracy: z.number().optional() })),
  asyncHandler(async (req, res) => {
    const cp = await Checkpoint.findOne({ _id: req.params.id, organization: req.orgId });
    if (!cp) throw notFound('Point introuvable');
    cp.location = latLngToPoint(req.body.lat, req.body.lng);
    await cp.save();
    audit(req, 'checkpoint.calibrated', 'Checkpoint', cp._id, req.body);
    res.json({ checkpoint: cp });
  })
);

// Révocation : nouveau QR, l'ancienne étiquette ne fonctionne plus
router.post(
  '/:id/regenerate-qr',
  requireRole(...ADMIN_ROLES),
  asyncHandler(async (req, res) => {
    const cp = await Checkpoint.findOne({ _id: req.params.id, organization: req.orgId });
    if (!cp) throw notFound('Point introuvable');
    cp.qrNonce = crypto.randomBytes(6).toString('hex');
    cp.qrVersion += 1;
    cp.qrPrintedAt = undefined;
    await cp.save();
    audit(req, 'checkpoint.qr_regenerated', 'Checkpoint', cp._id, { version: cp.qrVersion });
    res.json({ checkpoint: { ...cp.toJSON(), qrPayload: buildPayload(cp) } });
  })
);

// Image PNG du QR
router.get(
  '/:id/qr.png',
  requireRole(...STAFF_ROLES),
  asyncHandler(async (req, res) => {
    const cp = await Checkpoint.findOne({ _id: req.params.id, organization: req.orgId });
    if (!cp) throw notFound('Point introuvable');
    const png = await QRCode.toBuffer(buildPayload(cp), { errorCorrectionLevel: 'H', margin: 2, width: 800 });
    res.type('png').send(png);
  })
);

// Planche d'étiquettes PDF (A4, 2 x 3 par page) à imprimer et plastifier
router.get(
  '/labels.pdf',
  requireRole(...STAFF_ROLES),
  asyncHandler(async (req, res) => {
    const filter = { organization: req.orgId, active: true };
    if (req.query.site) filter.site = req.query.site;
    if (req.query.ids) filter._id = { $in: String(req.query.ids).split(',') };
    const [cps, org] = await Promise.all([
      Checkpoint.find(filter).populate('site', 'name').sort({ site: 1, code: 1 }),
      Organization.findById(req.orgId),
    ]);
    if (!cps.length) throw notFound('Aucun point de contrôle');

    const doc = new PDFDocument({ size: 'A4', margin: 28 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="qr-points-${Date.now()}.pdf"`);
    doc.pipe(res);

    const cols = 2;
    const rows = 3;
    const pageW = doc.page.width - 56;
    const pageH = doc.page.height - 56;
    const cellW = pageW / cols;
    const cellH = pageH / rows;
    const red = org?.primaryColor || '#E92026';

    for (let i = 0; i < cps.length; i += 1) {
      const cp = cps[i];
      const slot = i % (cols * rows);
      if (i > 0 && slot === 0) doc.addPage();
      const x = 28 + (slot % cols) * cellW;
      const y = 28 + Math.floor(slot / cols) * cellH;
      // eslint-disable-next-line no-await-in-loop
      const png = await QRCode.toBuffer(buildPayload(cp), { errorCorrectionLevel: 'H', margin: 1, width: 600 });

      doc.save().roundedRect(x + 6, y + 6, cellW - 12, cellH - 12, 10).lineWidth(1).dash(4, { space: 4 }).stroke('#999').undash().restore();
      doc.rect(x + 6, y + 6, cellW - 12, 30).fill('#111');
      doc.fillColor(red).font('Helvetica-Bold').fontSize(13).text((org?.name || 'QR PATROL').toUpperCase(), x + 16, y + 15, { width: cellW - 32 });
      doc.fillColor('#fff').font('Helvetica').fontSize(8).text('POINT DE CONTRÔLE', x + 16, y + 18, { width: cellW - 32, align: 'right' });

      const qrSize = Math.min(cellW - 70, cellH - 120);
      doc.image(png, x + (cellW - qrSize) / 2, y + 44, { width: qrSize, height: qrSize });

      doc.fillColor('#111').font('Helvetica-Bold').fontSize(14).text(`${cp.code || ''}  ${cp.name}`, x + 14, y + 50 + qrSize, { width: cellW - 28, align: 'center' });
      doc.fillColor('#555').font('Helvetica').fontSize(9).text(`${cp.site?.name || ''} · v${cp.qrVersion}`, x + 14, y + 70 + qrSize, { width: cellW - 28, align: 'center' });
      doc.fillColor('#888').fontSize(7).text('Ne pas retirer — étiquette de contrôle des rondes', x + 14, y + cellH - 26, { width: cellW - 28, align: 'center' });
    }
    doc.end();
    await Checkpoint.updateMany({ _id: { $in: cps.map((c) => c._id) } }, { qrPrintedAt: new Date() });
    audit(req, 'checkpoint.labels_printed', 'Checkpoint', null, { count: cps.length });
  })
);

router.delete(
  '/:id',
  requireRole(...ADMIN_ROLES),
  asyncHandler(async (req, res) => {
    const cp = await Checkpoint.findOneAndUpdate({ _id: req.params.id, organization: req.orgId }, { active: false }, { new: true });
    if (!cp) throw notFound('Point introuvable');
    audit(req, 'checkpoint.deactivated', 'Checkpoint', cp._id);
    res.json({ ok: true });
  })
);

module.exports = router;
