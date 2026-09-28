const { Schema, model, Types } = require('mongoose');
const { PointSchema, toJSONClean } = require('./common');

const SiteSchema = new Schema(
  {
    organization: { type: Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true, uppercase: true },
    client: { type: String, trim: true }, // client final protégé (si société de gardiennage)
    address: String,
    city: { type: String, default: 'Kinshasa' },
    location: PointSchema,
    // Zone autorisée du site (géofence) — rayon simple autour du centre
    geofenceRadius: { type: Number, default: 300 },
    contactName: String,
    contactPhone: String,
    instructions: String, // consignes générales du poste
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

SiteSchema.index({ location: '2dsphere' }, { sparse: true });
SiteSchema.index({ organization: 1, code: 1 }, { unique: true, partialFilterExpression: { code: { $type: 'string' } } });

toJSONClean(SiteSchema);
module.exports = model('Site', SiteSchema);
