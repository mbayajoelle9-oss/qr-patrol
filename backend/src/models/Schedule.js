const { Schema, model, Types } = require('mongoose');
const { toJSONClean } = require('./common');

// Planning récurrent : génère automatiquement les rondes du jour
const ScheduleSchema = new Schema(
  {
    organization: { type: Types.ObjectId, ref: 'Organization', required: true, index: true },
    site: { type: Types.ObjectId, ref: 'Site', required: true },
    route: { type: Types.ObjectId, ref: 'Route', required: true },
    name: { type: String, trim: true },
    // Agents qui peuvent effectuer ces rondes (le premier disponible la prend)
    agents: [{ type: Types.ObjectId, ref: 'User' }],
    daysOfWeek: { type: [Number], default: [0, 1, 2, 3, 4, 5, 6] }, // 0 = dimanche
    // Heures de départ "HH:mm" (heure de Kinshasa)
    startTimes: { type: [String], default: [] },
    // Alternative : toutes les N minutes entre fromTime et toTime
    every: {
      minutes: Number,
      fromTime: String,
      toTime: String,
    },
    windowMinutes: { type: Number, default: 60 }, // délai max pour terminer la ronde
    active: { type: Boolean, default: true },
    validFrom: Date,
    validUntil: Date,
  },
  { timestamps: true }
);

toJSONClean(ScheduleSchema);
module.exports = model('Schedule', ScheduleSchema);
