const { Schema, model, Types } = require('mongoose');
const { toJSONClean } = require('./common');

// Type de ronde (ex : « Ronde complète », « Ronde express », « Ronde technique »)
// Classe/typologie utilisée pour organiser les parcours et plannings.
const RoundTypeSchema = new Schema(
  {
    organization: { type: Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    color: { type: String, trim: true }, // repère visuel dans la centrale
    defaultDurationMinutes: Number,
    requireBiometric: { type: Boolean, default: false }, // vérification empreinte/faciale exigée à chaque point
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

RoundTypeSchema.index({ organization: 1, name: 1 }, { unique: true });

toJSONClean(RoundTypeSchema);
module.exports = model('RoundType', RoundTypeSchema);
