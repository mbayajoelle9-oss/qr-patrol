const { Schema, model, Types } = require('mongoose');
const { toJSONClean } = require('./common');

// Planning récurrent : génère automatiquement les rondes du jour
const ScheduleSchema = new Schema(
  {
    organization: { type: Types.ObjectId, ref: 'Organization', required: true, index: true },
    site: { type: Types.ObjectId, ref: 'Site', required: true },
    route: { type: Types.ObjectId, ref: 'Route', required: true },
    name: { type: String, trim: true },
    // Shift (vacation) auquel cette ronde est rattachée — la ronde est incluse dans le shift
    shift: { type: Types.ObjectId, ref: 'Shift' },
    // Type de ronde (ronde complète, express, technique…)
    roundType: { type: Types.ObjectId, ref: 'RoundType' },
    // Rondier unique affecté à cette planification (mode d'affectation directe)
    assignedAgent: { type: Types.ObjectId, ref: 'User' },
    // Agents qui peuvent effectuer ces rondes si aucun rondier n'est directement affecté
    // (le premier disponible la prend)
    agents: [{ type: Types.ObjectId, ref: 'User' }],
    daysOfWeek: { type: [Number], default: [0, 1, 2, 3, 4, 5, 6] }, // 0 = dimanche
    // Heures de départ FIXES "HH:mm" (heure de Kinshasa) — définies par le client,
    // c'est le mode recommandé (fréquences fixes).
    startTimes: { type: [String], default: [] },
    // Ancien mode (fréquence régulière) : toutes les N minutes entre fromTime et toTime.
    // Conservé pour compatibilité mais déprécié au profit des heures fixes.
    every: {
      minutes: Number,
      fromTime: String,
      toTime: String,
    },
    // Ronde ajoutée manuellement en dehors du planning fixe habituel
    manual: { type: Boolean, default: false },
    windowMinutes: { type: Number, default: 60 }, // délai max pour terminer la ronde
    active: { type: Boolean, default: true },
    validFrom: Date,
    validUntil: Date,
  },
  { timestamps: true }
);

toJSONClean(ScheduleSchema);
module.exports = model('Schedule', ScheduleSchema);
