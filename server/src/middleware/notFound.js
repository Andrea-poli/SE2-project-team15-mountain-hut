import { NotFound } from '../errors.js';

// Any /api request that no route answered.
export function notFound(req, res, next) {
  next(new NotFound(`No API endpoint for ${req.method} ${req.originalUrl}`));
}
