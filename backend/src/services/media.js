const crypto = require('crypto');
const mongoose = require('mongoose');
const { Readable } = require('stream');
const config = require('../config');
const { getBucket } = require('../db');
const { Media } = require('../models');

function kindFromMime(mime = '') {
  if (mime.startsWith('image/')) return 'photo';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}

const ALLOWED = /^(image\/(jpeg|png|webp|heic|heif)|video\/(mp4|quicktime|3gpp|webm)|audio\/(mpeg|mp4|m4a|aac|x-m4a|webm)|application\/pdf)$/;

/** Enregistre un fichier multer (mémoire) dans GridFS et crée le document Media. */
async function saveUpload(file, { orgId, userId, context = 'other', capturedAt }) {
  if (!ALLOWED.test(file.mimetype)) {
    const err = new Error(`Type de fichier non autorisé : ${file.mimetype}`);
    err.status = 400;
    throw err;
  }
  const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
  const bucket = getBucket();
  const fileId = new mongoose.Types.ObjectId();
  await new Promise((resolve, reject) => {
    Readable.from(file.buffer)
      .pipe(
        bucket.openUploadStreamWithId(fileId, file.originalname || `${fileId}`, {
          metadata: { organization: orgId, contentType: file.mimetype },
        })
      )
      .on('finish', resolve)
      .on('error', reject);
  });
  return Media.create({
    organization: orgId,
    fileId,
    kind: kindFromMime(file.mimetype),
    mimeType: file.mimetype,
    size: file.size,
    originalName: file.originalname,
    uploadedBy: userId,
    context,
    sha256,
    capturedAt,
  });
}

/** Lien signé temporaire (utilisable dans <img>/<video> sans entête Authorization). */
function signedUrl(mediaId, ttlSeconds = 3600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = crypto.createHmac('sha256', config.mediaSecret).update(`${mediaId}.${exp}`).digest('base64url');
  return `${config.publicApiUrl}/api/media/${mediaId}/file?exp=${exp}&sig=${sig}`;
}

function verifySignature(mediaId, exp, sig) {
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  const expected = crypto.createHmac('sha256', config.mediaSecret).update(`${mediaId}.${exp}`).digest('base64url');
  const a = Buffer.from(String(sig));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Ajoute `url` à des documents Media (peuplés). */
function withUrls(mediaList = []) {
  return mediaList.filter(Boolean).map((m) => {
    const obj = typeof m.toJSON === 'function' ? m.toJSON() : m;
    if (!obj || !obj._id) return obj;
    return { ...obj, url: signedUrl(obj._id.toString()) };
  });
}

module.exports = { saveUpload, signedUrl, verifySignature, withUrls, kindFromMime };
