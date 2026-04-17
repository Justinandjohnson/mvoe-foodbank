// Authentication Middleware - JWT verification
import { AuthenticationError, AuthorizationError } from '../utils/errors.js';
import authService from '../services/auth.service.js';

/**
 * Authenticate JWT token
 */
export const authenticate = async (request, reply) => {
  try {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('Access token required');
    }

    const token = authHeader.substring(7);
    const user = await authService.verifyToken(token, request.server);

    // Attach user to request
    request.user = user;
  } catch (error) {
    throw new AuthenticationError(error.message || 'Invalid token');
  }
};

/**
 * Require specific user type
 * @param {string[]} allowedTypes - Allowed user types
 */
export const requireUserType = (allowedTypes) => {
  return async (request, reply) => {
    if (!request.user) {
      throw new AuthenticationError('Authentication required');
    }

    if (!allowedTypes.includes(request.user.userType)) {
      throw new AuthorizationError(
        `Requires one of: ${allowedTypes.join(', ')}`
      );
    }
  };
};

/**
 * Require admin role
 */
export const requireAdmin = async (request, reply) => {
  if (!request.user) {
    throw new AuthenticationError('Authentication required');
  }

  if (request.user.userType !== 'admin') {
    throw new AuthorizationError('Admin access required');
  }
};

/**
 * Optional authentication (doesn't fail if no token)
 */
export const optionalAuth = async (request, reply) => {
  try {
    const authHeader = request.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const user = await authService.verifyToken(token, request.server);
      request.user = user;
    }
  } catch (error) {
    // Silently fail - user stays undefined
    request.user = null;
  }
};
