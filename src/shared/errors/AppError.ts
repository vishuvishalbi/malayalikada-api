export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly data?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') { super(404, message); }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') { super(403, message); }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') { super(401, message); }
}

export class ValidationError extends AppError {
  constructor(message: string, data?: unknown) { super(422, message, data); }
}

export class ConflictError extends AppError {
  constructor(message: string) { super(409, message); }
}
