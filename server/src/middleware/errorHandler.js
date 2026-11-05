import { AppError } from '../errors.js';

// Every error becomes { error: "…" }. Users never see technical details:
// unexpected errors are logged on the server and answered with a generic 500.
// eslint-disable-next-line no-unused-vars -- Express needs 4 arguments to recognise an error handler
export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message });
  }
  // Client errors from express.json(): malformed JSON (400), body too large (413),
  // unsupported encoding (415), aborted request (400), ... They are not server bugs: no log.
  if (err.expose && err.status >= 400 && err.status < 500) {
    const message = err.type === 'entity.parse.failed' ? 'Invalid JSON body' : err.message;
    return res.status(err.status).json({ error: message });
  }
  console.error(err);
  return res.status(500).json({ error: 'Something went wrong, please try again' });
}
