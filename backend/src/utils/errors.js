// Custom Error Classes - Uniform error handling
export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message, details = {}) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409, 'CONFLICT');
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

export class PaymentError extends AppError {
  constructor(message, stripeError = null) {
    super(message, 402, 'PAYMENT_ERROR');
    this.stripeError = stripeError;
  }
}

/**
 * Error handler middleware for Fastify
 */
export const errorHandler = (error, request, reply) => {
  const { log } = request;

  // Handle operational errors
  if (error.isOperational) {
    log.warn({
      error: {
        message: error.message,
        code: error.code,
        statusCode: error.statusCode,
      },
    });

    return reply.status(error.statusCode).send({
      success: false,
      error: {
        message: error.message,
        code: error.code,
        ...(error.details && { details: error.details }),
      },
    });
  }

  // Handle validation errors from Zod
  if (error.validation) {
    return reply.status(400).send({
      success: false,
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: error.validation,
      },
    });
  }

  // Handle Prisma errors
  if (error.code && error.code.startsWith('P')) {
    log.error({ error }, 'Database error');
    return reply.status(500).send({
      success: false,
      error: {
        message: 'Database operation failed',
        code: 'DATABASE_ERROR',
      },
    });
  }

  // Handle unexpected errors
  log.error({ error }, 'Unexpected error');
  return reply.status(500).send({
    success: false,
    error: {
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
    },
  });
};
