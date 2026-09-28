const { badRequest } = require('../utils/http');

/** Valide req.body (ou req.query) avec un schéma zod et remplace par la version nettoyée. */
const validate =
  (schema, where = 'body') =>
  (req, _res, next) => {
    const result = schema.safeParse(req[where] ?? {});
    if (!result.success) {
      const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      return next(badRequest('Données invalides', details));
    }
    if (where === 'query') {
      req.validatedQuery = result.data;
    } else {
      req[where] = result.data;
    }
    next();
  };

module.exports = { validate };
