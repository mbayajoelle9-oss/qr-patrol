const { Schema } = require('mongoose');

// Point GeoJSON { type: 'Point', coordinates: [lng, lat] }
const PointSchema = new Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: {
      type: [Number],
      validate: {
        validator: (v) => !v || (Array.isArray(v) && v.length === 2),
        message: 'coordinates doit être [lng, lat]',
      },
    },
  },
  { _id: false }
);

// Position capturée par le téléphone
const CapturedLocationSchema = new Schema(
  {
    lat: Number,
    lng: Number,
    accuracy: Number, // mètres
    altitude: Number,
    speed: Number,
    heading: Number,
    mocked: Boolean, // Android : position simulée
    capturedAt: Date,
  },
  { _id: false }
);

const DeviceInfoSchema = new Schema(
  {
    deviceId: String,
    model: String,
    os: String,
    osVersion: String,
    appVersion: String,
  },
  { _id: false }
);

function toJSONClean(schema) {
  schema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform: (_doc, ret) => {
      ret.id = ret._id?.toString();
      delete ret.passwordHash;
      delete ret.tokenVersion;
      return ret;
    },
  });
}

module.exports = { PointSchema, CapturedLocationSchema, DeviceInfoSchema, toJSONClean };
