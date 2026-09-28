const { Schema, model, Types } = require('mongoose');
const crypto = require('crypto');
const { PointSchema, toJSONClean } = require('./common');

const CheckpointSchema = new Schema(
  {
    organization: { type: Types.ObjectId, ref: 'Organization', required: true, index: true },
    site: { type: Types.ObjectId, ref: 'Site', required: true, index: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true, uppercase: true }, // ex : P01
    description: String,
    instructions: String, // consigne affichée à l'agent après scan
    location: PointSchema,
    radius: { type: Number }, // m ; défaut = settings.defaultCheckpointRadius
    requireGps: { type: Boolean, default: true },
    requirePhoto: { type: Boolean, default: false },
    // Nonce inclus dans le QR ; le régénérer invalide les anciennes étiquettes
    qrNonce: { type: String, default: () => crypto.randomBytes(6).toString('hex') },
    qrVersion: { type: Number, default: 1 },
    qrPrintedAt: Date,
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

CheckpointSchema.index({ location: '2dsphere' }, { sparse: true });

toJSONClean(CheckpointSchema);
module.exports = model('Checkpoint', CheckpointSchema);
