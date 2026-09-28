const router = require('express').Router();
const multer = require('multer');
const mongoose = require('mongoose');
const config = require('../config');
const { Media } = require('../models');
const { requireAuth, requireOrg } = require('../middleware/auth');
const { asyncHandler, notFound, badRequest, unauthorized } = require('../utils/http');
const { getBucket } = require('../db');
const { saveUpload, verifySignature, signedUrl } = require('../services/media');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.uploadMaxBytes, files: 1 } });

// Téléversement (photo / vidéo / audio) — champ "file"
router.post(
  '/',
  requireAuth,
  requireOrg,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('Fichier manquant (champ "file")');
    const context = ['incident', 'scan', 'intervention', 'avatar', 'other'].includes(req.body.context) ? req.body.context : 'other';
    const media = await saveUpload(req.file, {
      orgId: req.orgId,
      userId: req.user._id,
      context,
      capturedAt: req.body.capturedAt ? new Date(req.body.capturedAt) : undefined,
    }).catch((e) => {
      if (e.status === 400) throw badRequest(e.message);
      throw e;
    });
    res.status(201).json({ media: { ...media.toJSON(), url: signedUrl(media._id.toString()) } });
  })
);

// Lecture : lien signé (?exp&sig) ou entête Authorization
router.get(
  '/:id/file',
  async (req, res, next) => {
    if (req.query.sig && verifySignature(req.params.id, req.query.exp, req.query.sig)) return next();
    return requireAuth(req, res, next);
  },
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw notFound();
    const media = await Media.findById(req.params.id);
    if (!media) throw notFound('Média introuvable');
    if (req.user && req.orgId && String(media.organization) !== String(req.orgId)) throw unauthorized();

    const bucket = getBucket();
    const files = await bucket.find({ _id: media.fileId }).toArray();
    if (!files.length) throw notFound('Fichier introuvable');
    const size = files[0].length;
    res.setHeader('Content-Type', media.mimeType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Accept-Ranges', 'bytes');

    // Support des requêtes Range (lecture vidéo)
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      const start = m && m[1] ? parseInt(m[1], 10) : 0;
      const end = m && m[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1;
      if (start >= size) {
        res.status(416).setHeader('Content-Range', `bytes */${size}`);
        return res.end();
      }
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
      res.setHeader('Content-Length', end - start + 1);
      return bucket.openDownloadStream(media.fileId, { start, end: end + 1 }).on('error', () => res.end()).pipe(res);
    }
    res.setHeader('Content-Length', size);
    bucket.openDownloadStream(media.fileId).on('error', () => res.end()).pipe(res);
  })
);

module.exports = router;
