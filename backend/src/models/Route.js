const { Schema, model, Types } = require('mongoose');
const { toJSONClean } = require('./common');

// Parcours de ronde : liste ordonnée de points à visiter sur un site
const RouteSchema = new Schema(
  {
    organization: { type: Types.ObjectId, ref: 'Organization', required: true, index: true },
    site: { type: Types.ObjectId, ref: 'Site', required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: String,
    checkpoints: [
      {
        _id: false,
        checkpoint: { type: Types.ObjectId, ref: 'Checkpoint', required: true },
        order: { type: Number, required: true },
        optional: { type: Boolean, default: false },
      },
    ],
    strictOrder: { type: Boolean, default: false },
    expectedDurationMinutes: { type: Number, default: 30 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

toJSONClean(RouteSchema);
module.exports = model('Route', RouteSchema);
