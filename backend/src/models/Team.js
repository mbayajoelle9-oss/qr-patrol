const { Schema, model, Types } = require('mongoose');
const { toJSONClean } = require('./common');

// Équipe d'intervention (patrouille mobile, brigade…)
const TeamSchema = new Schema(
  {
    organization: { type: Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true },
    callSign: String, // indicatif radio
    vehicle: String,
    phone: String,
    leader: { type: Types.ObjectId, ref: 'User' },
    members: [{ type: Types.ObjectId, ref: 'User' }],
    sites: [{ type: Types.ObjectId, ref: 'Site' }], // zone couverte
    available: { type: Boolean, default: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

toJSONClean(TeamSchema);
module.exports = model('Team', TeamSchema);
