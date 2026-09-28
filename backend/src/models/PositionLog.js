const { Schema, model, Types } = require('mongoose');

// Historique des positions des agents en service (conservé 30 jours)
const PositionLogSchema = new Schema({
  organization: { type: Types.ObjectId, ref: 'Organization', required: true },
  agent: { type: Types.ObjectId, ref: 'User', required: true },
  patrol: { type: Types.ObjectId, ref: 'Patrol' },
  lat: Number,
  lng: Number,
  accuracy: Number,
  speed: Number,
  battery: Number,
  mocked: Boolean,
  capturedAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 },
});

PositionLogSchema.index({ agent: 1, capturedAt: -1 });
PositionLogSchema.index({ organization: 1, capturedAt: -1 });

module.exports = model('PositionLog', PositionLogSchema);
