import { AppError } from '../errors.js';

// Every error becomes { error: "…" }. Users never see technical details:
// unexpected errors are logged on the server and answered with a generic 500.
// eslint-disable-next-line no-unused-vars -- Express needs 4 arguments to recognise an error handler
export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message });
  }
  // Malformed JSON body (express.json)
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  console.error(err);
  return res.status(500).json({ error: 'Something went wrong, please try again' });
}
