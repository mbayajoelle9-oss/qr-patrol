require('dotenv').config();

function required(name) {
  const v = process.env[name];
  if (!v) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Variable d'environnement manquante : ${name}`);
    }
    console.warn(`[config] ${name} non défini — valeur de développement utilisée`);
    return `dev-${name.toLowerCase()}`;
  }
  return v;
}

module.exports = {
  port: Number(process.env.PORT || 4000),
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/qr-patrol',
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  qrSecret: required('QR_SECRET'),
  mediaSecret: required('MEDIA_SECRET'),
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  publicApiUrl: (process.env.PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, ''),
  schedulerEnabled: process.env.SCHEDULER_ENABLED !== 'false',
  timezone: process.env.TZ || 'Africa/Kinshasa',
  uploadMaxBytes: 60 * 1024 * 1024, // 60 Mo (vidéos courtes)
};
