const { Schema, model, Types } = require('mongoose');
const { INCIDENT_TYPES, SEVERITIES, INCIDENT_STATUS } = require('../utils/constants');
const { CapturedLocationSchema, toJSONClean } = require('./common');

const IncidentSchema = new Schema(
  {
    organization: { type: Types.ObjectId, ref: 'Organization', required: true, index: true },
    reference: { type: String, index: true }, // INC-2026-000123
    site: { type: Types.ObjectId, ref: 'Site', index: true },
    checkpoint: { type: Types.ObjectId, ref: 'Checkpoint' },
    patrol: { type: Types.ObjectId, ref: 'Patrol' },
    reportedBy: { type: Types.ObjectId, ref: 'User', required: true },
    source: { type: String, enum: ['agent', 'sos', 'centrale', 'system'], default: 'agent' },
    type: { type: String, enum: INCIDENT_TYPES, required: true },
    severity: { type: String, enum: SEVERITIES, default: 'medium', index: true },
    title: String,
    description: String,
    location: CapturedLocationSchema,
    media: [{ type: Types.ObjectId, ref: 'Media' }],
    status: {
      type: String,
      enum: Object.values(INCIDENT_STATUS),
      default: INCIDENT_STATUS.DECLARED,
      index: true,
    },
    acknowledgedBy: { type: Types.ObjectId, ref: 'User' },
    acknowledgedAt: Date,
    resolvedAt: Date,
    closedAt: Date,
    resolution: String,
    clientId: String, // idempotence hors-ligne
    timeline: [
      {
        _id: false,
        at: { type: Date, default: Date.now },
        by: { type: Types.ObjectId, ref: 'User' },
        action: String, // created, status:acknowledged, comment, media, dispatch...
        note: String,
      },
    ],
  },
  { timestamps: true }
);

IncidentSchema.index({ organization: 1, createdAt: -1 });
IncidentSchema.index({ reportedBy: 1, clientId: 1 }, { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } });

toJSONClean(IncidentSchema);
module.exports = model('Incident', IncidentSchema);
