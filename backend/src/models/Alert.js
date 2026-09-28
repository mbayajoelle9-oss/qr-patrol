const { Schema, model, Types } = require('mongoose');
const { toJSONClean } = require('./common');

// Alertes système affichées à la centrale (rondes en retard, scans suspects, SOS…)
const AlertSchema = new Schema(
  {
    organization: { type: Types.ObjectId, ref: 'Organization', required: true, index: true },
    type: {
      type: String,
      enum: ['sos', 'incident', 'suspicious_scan', 'patrol_late', 'patrol_missed', 'agent_offline', 'device_change'],
      required: true,
    },
    level: { type: String, enum: ['info', 'warning', 'critical'], default: 'warning' },
    title: String,
    message: String,
    site: { type: Types.ObjectId, ref: 'Site' },
    agent: { type: Types.ObjectId, ref: 'User' },
    patrol: { type: Types.ObjectId, ref: 'Patrol' },
    incident: { type: Types.ObjectId, ref: 'Incident' },
    scan: { type: Types.ObjectId, ref: 'ScanEvent' },
    acknowledged: { type: Boolean, default: false, index: true },
    acknowledgedBy: { type: Types.ObjectId, ref: 'User' },
    acknowledgedAt: Date,
  },
  { timestamps: true }
);

AlertSchema.index({ organization: 1, createdAt: -1 });

toJSONClean(AlertSchema);
module.exports = model('Alert', AlertSchema);
