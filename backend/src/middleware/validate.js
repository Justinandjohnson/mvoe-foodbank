// Validation Middleware - Request validation with Zod
import { ValidationError } from '../utils/errors.js';

/**
 * Validate request body
 * @param {ZodSchema} schema - Zod validation schema
 */
export const validateBody = (schema) => {
  return async (request, reply) => {
    try {
      request.body = schema.parse(request.body);
    } catch (error) {
      throw new ValidationError('Validation failed', error.errors);
    }
  };
};

/**
 * Validate request query params
 * @param {ZodSchema} schema - Zod validation schema
 */
export const validateQuery = (schema) => {
  return async (request, reply) => {
    try {
      request.query = schema.parse(request.query);
    } catch (error) {
      throw new ValidationError('Invalid query parameters', error.errors);
    }
  };
};

/**
 * Validate request params
 * @param {ZodSchema} schema - Zod validation schema
 */
export const validateParams = (schema) => {
  return async (request, reply) => {
    try {
      request.params = schema.parse(request.params);
    } catch (error) {
      throw new ValidationError('Invalid parameters', error.errors);
    }
  };
};
