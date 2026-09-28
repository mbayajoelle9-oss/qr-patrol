const { Schema, model, Types } = require('mongoose');

const AuditLogSchema = new Schema({
  organization: { type: Types.ObjectId, ref: 'Organization', index: true },
  user: { type: Types.ObjectId, ref: 'User' },
  action: { type: String, required: true }, // ex : checkpoint.qr_regenerated
  entity: String,
  entityId: Types.ObjectId,
  details: Schema.Types.Mixed,
  ip: String,
  createdAt: { type: Date, default: Date.now, index: true },
});

module.exports = model('AuditLog', AuditLogSchema);
