const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const config = require('./config');
const { requireAuth } = require('./middleware/auth');
const { notFoundHandler, errorHandler } = require('./middleware/error');

function createApp() {
  const app = express();
  app.set('trust proxy', 1); // Render / Vercel derrière un proxy

  // CORS multi-origines (web centrale, domaines de prévisualisation Vercel, app mobile sans origine)
  app.use(
    cors({
      origin(origin, cb) {
        if (!origin) return cb(null, true); // app mobile, curl
        if (config.corsOrigins.includes(origin) || config.corsOrigins.includes('*')) return cb(null, true);
        if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin) && config.corsOrigins.some((o) => o.endsWith('.vercel.app'))) {
          return cb(null, true);
        }
        return cb(new Error(`Origine non autorisée : ${origin}`));
      },
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Org-Id'],
      exposedHeaders: ['Content-Disposition'],
    })
  );
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(compression());
  app.use(express.json({ limit: '2mb' }));
  app.use(morgan(config.isProd ? 'combined' : 'dev'));

  app.get('/', (_req, res) => res.json({ name: 'QR Patrol API', status: 'ok' }));
  app.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

  // Public
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/meta', require('./routes/meta'));
  app.use('/api/media', require('./routes/media')); // gère sa propre authentification

  // Authentifié
  app.use('/api', requireAuth);
  app.use('/api/organizations', require('./routes/organizations'));
  app.use('/api/users', require('./routes/users'));
  app.use('/api/sites', require('./routes/sites'));
  app.use('/api/checkpoints', require('./routes/checkpoints'));
  app.use('/api/routes', require('./routes/parcours'));
  app.use('/api/round-types', require('./routes/roundTypes'));
  app.use('/api/shifts', require('./routes/shifts'));
  app.use('/api/schedules', require('./routes/schedules'));
  app.use('/api/patrols', require('./routes/patrols'));
  app.use('/api/scans', require('./routes/scans'));
  app.use('/api/incidents', require('./routes/incidents'));
  app.use('/api/interventions', require('./routes/interventions'));
  app.use('/api/teams', require('./routes/teams'));
  app.use('/api/presence', require('./routes/presence'));
  app.use('/api/alerts', require('./routes/alerts'));
  app.use('/api/dashboard', require('./routes/dashboard'));
  app.use('/api/reports', require('./routes/reports'));
  app.use('/api/audit', require('./routes/audit'));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
