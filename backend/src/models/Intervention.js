const { Schema, model, Types } = require('mongoose');
const { INTERVENTION_STATUS } = require('../utils/constants');
const { toJSONClean } = require('./common');

const InterventionSchema = new Schema(
  {
    organization: { type: Types.ObjectId, ref: 'Organization', required: true, index: true },
    incident: { type: Types.ObjectId, ref: 'Incident', required: true, index: true },
    team: { type: Types.ObjectId, ref: 'Team' },
    members: [{ type: Types.ObjectId, ref: 'User' }],
    dispatchedBy: { type: Types.ObjectId, ref: 'User' },
    status: { type: String, enum: INTERVENTION_STATUS, default: 'dispatched', index: true },
    instructions: String,
    dispatchedAt: { type: Date, default: Date.now },
    enRouteAt: Date,
    onSiteAt: Date,
    completedAt: Date,
    report: String,
    media: [{ type: Types.ObjectId, ref: 'Media' }],
  },
  { timestamps: true }
);

toJSONClean(InterventionSchema);
module.exports = model('Intervention', InterventionSchema);
