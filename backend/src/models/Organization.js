const { Schema, model } = require('mongoose');
const { toJSONClean } = require('./common');

const OrganizationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    logoUrl: String,
    primaryColor: { type: String, default: '#E92026' },
    contactEmail: String,
    contactPhone: String,
    address: String,
    active: { type: Boolean, default: true },
    settings: {
      // Anti-fraude
      defaultCheckpointRadius: { type: Number, default: 50 }, // m
      maxGpsAccuracy: { type: Number, default: 60 }, // m
      duplicateScanMinutes: { type: Number, default: 5 },
      maxWalkingSpeed: { type: Number, default: 8 }, // m/s (≈ 29 km/h, tolère une moto sur grands sites)
      maxClockSkewMinutes: { type: Number, default: 10 },
      offlineScanMaxHours: { type: Number, default: 24 },
      enforceDeviceBinding: { type: Boolean, default: true },
      rejectMockLocation: { type: Boolean, default: false },
      // Rondes
      lateToleranceMinutes: { type: Number, default: 10 },
      positionPingSeconds: { type: Number, default: 60 },
      // Alertes
      alertOnSuspiciousScan: { type: Boolean, default: true },
      alertOnLatePatrol: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

toJSONClean(OrganizationSchema);
module.exports = model('Organization', OrganizationSchema);
