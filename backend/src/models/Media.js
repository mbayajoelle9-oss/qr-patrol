const { Schema, model, Types } = require('mongoose');
const { toJSONClean } = require('./common');

// Métadonnées d'un fichier stocké dans GridFS (bucket "media")
const MediaSchema = new Schema(
  {
    organization: { type: Types.ObjectId, ref: 'Organization', required: true, index: true },
    fileId: { type: Types.ObjectId, required: true },
    kind: { type: String, enum: ['photo', 'video', 'audio', 'document'], required: true },
    mimeType: String,
    size: Number,
    originalName: String,
    uploadedBy: { type: Types.ObjectId, ref: 'User' },
    context: { type: String, enum: ['incident', 'scan', 'intervention', 'avatar', 'other'], default: 'other' },
    sha256: String, // intégrité / preuve
    capturedAt: Date,
  },
  { timestamps: true }
);

toJSONClean(MediaSchema);
module.exports = model('Media', MediaSchema);
