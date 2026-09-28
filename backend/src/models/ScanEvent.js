const { Schema, model, Types } = require('mongoose');
const { SCAN_STATUS } = require('../utils/constants');
const { CapturedLocationSchema, DeviceInfoSchema, toJSONClean } = require('./common');

const ScanEventSchema = new Schema(
  {
    organization: { type: Types.ObjectId, ref: 'Organization', required: true, index: true },
    site: { type: Types.ObjectId, ref: 'Site', index: true },
    checkpoint: { type: Types.ObjectId, ref: 'Checkpoint', index: true },
    patrol: { type: Types.ObjectId, ref: 'Patrol', index: true },
    agent: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    rawPayload: String, // contenu brut du QR (pour audit)
    clientId: { type: String }, // uuid généré par le téléphone (idempotence hors-ligne)
    scannedAt: { type: Date, required: true }, // heure de scan côté téléphone
    receivedAt: { type: Date, default: Date.now }, // heure de réception serveur
    offline: { type: Boolean, default: false },
    location: CapturedLocationSchema,
    distanceMeters: Number,
    device: DeviceInfoSchema,
    status: { type: String, enum: Object.values(SCAN_STATUS), required: true, index: true },
    flags: [{ type: String }],
    comment: String,
    photo: { type: Types.ObjectId, ref: 'Media' },
    reviewed: {
      by: { type: Types.ObjectId, ref: 'User' },
      at: Date,
      decision: { type: String, enum: ['accepted', 'rejected'] },
      note: String,
    },
  },
  { timestamps: true }
);

ScanEventSchema.index({ organization: 1, scannedAt: -1 });
ScanEventSchema.index({ agent: 1, clientId: 1 }, { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } });

toJSONClean(ScanEventSchema);
module.exports = model('ScanEvent', ScanEventSchema);
