const { ApiError } = require('../utils/http');
const config = require('../config');

function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `Route introuvable : ${req.method} ${req.path}` } });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err?.name === 'ValidationError') {
    return res.status(400).json({
      error: {
        code: 'VALIDATION',
        message: 'Données invalides',
        details: Object.values(err.errors).map((e) => ({ path: e.path, message: e.message })),
      },
    });
  }
  if (err?.name === 'CastError') {
    return res.status(400).json({ error: { code: 'BAD_ID', message: `Identifiant invalide (${err.path})` } });
  }
  if (err?.code === 11000) {
    const field = Object.keys(err.keyPattern || {}).filter((k) => k !== 'organization').join(', ');
    return res.status(409).json({ error: { code: 'DUPLICATE', message: `Valeur déjà utilisée : ${field}` } });
  }
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: { code: 'FILE_TOO_LARGE', message: 'Fichier trop volumineux' } });
  }
  console.error('[error]', err);
  res.status(500).json({
    error: { code: 'INTERNAL', message: config.isProd ? 'Erreur interne' : err?.message || 'Erreur interne' },
  });
}

module.exports = { notFoundHandler, errorHandler };
