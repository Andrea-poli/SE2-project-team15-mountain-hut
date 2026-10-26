// Errors thrown by routes and services. The error handler turns them into
// { error: message } with the right status code (planning 4.3, A5).

export class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.name = new.target.name;
    this.status = status;
  }
}

export class BadRequest extends AppError {
  constructor(message = 'Invalid request') {
    super(400, message);
  }
}

/** Not logged in. */
export class Unauthorized extends AppError {
  constructor(message = 'You need to log in') {
    super(401, message);
  }
}

/** Logged in, but the role is not allowed. */
export class Forbidden extends AppError {
  constructor(message = 'This action is not available for your role') {
    super(403, message);
  }
}

export class NotFound extends AppError {
  constructor(message = 'Not found') {
    super(404, message);
  }
}

export class Conflict extends AppError {
  constructor(message = 'Conflict') {
    super(409, message);
  }
}
