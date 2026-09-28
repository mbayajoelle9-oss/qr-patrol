const crypto = require('crypto');
const config = require('../config');

/*
 * Format du QR Code imprimé sur chaque point de contrôle :
 *
 *   QRP1.<checkpointId>.<nonce>.<signature>
 *
 * - checkpointId : ObjectId du point (24 hex)
 * - nonce        : aléatoire stocké sur le point ; le régénérer révoque l'étiquette
 * - signature    : HMAC-SHA256(QR_SECRET, "QRP1.<id>.<nonce>") tronquée (base64url, 16 car.)
 *
 * Un QR fabriqué à la main ou copié d'un autre système est rejeté (signature),
 * et une étiquette remplacée n'est plus acceptée (nonce).
 */
const PREFIX = 'QRP1';

function sign(checkpointId, nonce) {
  return crypto
    .createHmac('sha256', config.qrSecret)
    .update(`${PREFIX}.${checkpointId}.${nonce}`)
    .digest('base64url')
    .slice(0, 16);
}

function buildPayload(checkpoint) {
  const id = checkpoint._id.toString();
  return `${PREFIX}.${id}.${checkpoint.qrNonce}.${sign(id, checkpoint.qrNonce)}`;
}

/** Retourne { checkpointId, nonce } ou null si le QR est invalide. */
function parsePayload(raw) {
  if (typeof raw !== 'string') return null;
  const parts = raw.trim().split('.');
  if (parts.length !== 4 || parts[0] !== PREFIX) return null;
  const [, checkpointId, nonce, sig] = parts;
  if (!/^[a-f0-9]{24}$/i.test(checkpointId)) return null;
  const expected = sign(checkpointId, nonce);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return { checkpointId, nonce };
}

module.exports = { buildPayload, parsePayload };
