class ApiError extends Error {
  constructor(status, message, code, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const badRequest = (msg, details) => new ApiError(400, msg, 'BAD_REQUEST', details);
const unauthorized = (msg = 'Non authentifié') => new ApiError(401, msg, 'UNAUTHORIZED');
const forbidden = (msg = 'Accès refusé') => new ApiError(403, msg, 'FORBIDDEN');
const notFound = (msg = 'Introuvable') => new ApiError(404, msg, 'NOT_FOUND');
const conflict = (msg) => new ApiError(409, msg, 'CONFLICT');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function paginate(req, defaults = { limit: 50 }) {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || defaults.limit, 1), 500);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  return { limit, page, skip: (page - 1) * limit };
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { ApiError, badRequest, unauthorized, forbidden, notFound, conflict, asyncHandler, paginate, escapeRegex };
