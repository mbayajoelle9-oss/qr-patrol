const { Schema, model, Types } = require('mongoose');
const { toJSONClean } = require('./common');

// Shift (vacation) : période de travail sur un site, à laquelle sont rattachées
// une ou plusieurs rondes (Schedule) et les rondiers affectés.
const ShiftSchema = new Schema(
  {
    organization: { type: Types.ObjectId, ref: 'Organization', required: true, index: true },
    site: { type: Types.ObjectId, ref: 'Site', required: true },
    name: { type: String, required: true, trim: true }, // ex : "Nuit", "Jour", "Week-end"
    startTime: { type: String, required: true }, // "HH:mm"
    endTime: { type: String, required: true }, // "HH:mm" (peut être < startTime : chevauche minuit)
    daysOfWeek: { type: [Number], default: [0, 1, 2, 3, 4, 5, 6] }, // 0 = dimanche
    rondiers: [{ type: Types.ObjectId, ref: 'User' }], // rondiers affectés à ce shift
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

toJSONClean(ShiftSchema);
module.exports = model('Shift', ShiftSchema);
