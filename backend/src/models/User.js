const { Schema, model, Types } = require('mongoose');
const bcrypt = require('bcryptjs');
const { ALL_ROLES } = require('../utils/constants');
const { CapturedLocationSchema, DeviceInfoSchema, toJSONClean } = require('./common');

const UserSchema = new Schema(
  {
    organization: { type: Types.ObjectId, ref: 'Organization', index: true }, // null pour super_admin
    role: { type: String, enum: ALL_ROLES, required: true, index: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true, sparse: true },
    phone: { type: String, trim: true },
    matricule: { type: String, trim: true, uppercase: true },
    passwordHash: { type: String, required: true },
    tokenVersion: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    photoUrl: String, // ancien champ, non utilisé (voir `photo`)
    photo: { type: Types.ObjectId, ref: 'Media' }, // photo de profil du rondier

    // Affectation (agents)
    sites: [{ type: Types.ObjectId, ref: 'Site' }],
    team: { type: Types.ObjectId, ref: 'Team' },

    // Téléphone lié (anti-fraude)
    boundDevice: DeviceInfoSchema,
    pushToken: String,

    // Présence
    onDuty: { type: Boolean, default: false },
    dutyStartedAt: Date,
    lastPosition: CapturedLocationSchema,
    lastSeenAt: Date,
    lastLoginAt: Date,
  },
  { timestamps: true }
);

UserSchema.index({ organization: 1, email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });
UserSchema.index(
  { organization: 1, matricule: 1 },
  { unique: true, partialFilterExpression: { matricule: { $type: 'string' } } }
);

UserSchema.virtual('fullName').get(function fullName() {
  return `${this.firstName} ${this.lastName}`.trim();
});

UserSchema.methods.setPassword = async function setPassword(pw) {
  this.passwordHash = await bcrypt.hash(pw, 12);
};
UserSchema.methods.checkPassword = function checkPassword(pw) {
  return bcrypt.compare(pw, this.passwordHash);
};

toJSONClean(UserSchema);
module.exports = model('User', UserSchema);
