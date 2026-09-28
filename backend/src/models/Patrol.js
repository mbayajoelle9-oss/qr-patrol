const { Schema, model, Types } = require('mongoose');
const { PATROL_STATUS } = require('../utils/constants');
const { toJSONClean } = require('./common');

// Une exécution de ronde (planifiée ou lancée à la demande)
const PatrolSchema = new Schema(
  {
    organization: { type: Types.ObjectId, ref: 'Organization', required: true, index: true },
    site: { type: Types.ObjectId, ref: 'Site', required: true, index: true },
    route: { type: Types.ObjectId, ref: 'Route', required: true },
    schedule: { type: Types.ObjectId, ref: 'Schedule' },
    slotKey: { type: String }, // idempotence de la génération planifiée
    agent: { type: Types.ObjectId, ref: 'User', index: true },
    eligibleAgents: [{ type: Types.ObjectId, ref: 'User' }],
    status: {
      type: String,
      enum: Object.values(PATROL_STATUS),
      default: PATROL_STATUS.SCHEDULED,
      index: true,
    },
    source: { type: String, enum: ['schedule', 'manual', 'agent'], default: 'manual' },
    scheduledStart: Date,
    dueBy: Date,
    startedAt: Date,
    endedAt: Date,
    lateAlertSent: { type: Boolean, default: false },
    checkpoints: [
      {
        _id: false,
        checkpoint: { type: Types.ObjectId, ref: 'Checkpoint', required: true },
        order: Number,
        optional: Boolean,
        scannedAt: Date,
        scan: { type: Types.ObjectId, ref: 'ScanEvent' },
        status: { type: String, enum: ['pending', 'done', 'suspicious', 'missed'], default: 'pending' },
      },
    ],
    stats: {
      total: { type: Number, default: 0 },
      done: { type: Number, default: 0 },
      suspicious: { type: Number, default: 0 },
      missed: { type: Number, default: 0 },
      incidents: { type: Number, default: 0 },
    },
    notes: String,
  },
  { timestamps: true }
);

PatrolSchema.index({ organization: 1, status: 1, scheduledStart: -1 });
PatrolSchema.index({ slotKey: 1 }, { unique: true, partialFilterExpression: { slotKey: { $type: 'string' } } });

PatrolSchema.methods.recomputeStats = function recomputeStats() {
  const cps = this.checkpoints || [];
  this.stats.total = cps.length;
  this.stats.done = cps.filter((c) => c.status === 'done' || c.status === 'suspicious').length;
  this.stats.suspicious = cps.filter((c) => c.status === 'suspicious').length;
  this.stats.missed = cps.filter((c) => c.status === 'missed').length;
};

toJSONClean(PatrolSchema);
module.exports = model('Patrol', PatrolSchema);
