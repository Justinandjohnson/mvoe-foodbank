// Auth Routes - Authentication endpoints
import authService from '../services/auth.service.js';
import { validateBody } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import {
  signupSchema,
  loginSchema,
  refreshTokenSchema,
  changePasswordSchema,
} from '../utils/validators.js';

export default async function authRoutes(fastify) {
  // Register new user
  fastify.post(
    '/signup',
    {
      preHandler: [validateBody(signupSchema)],
    },
    async (request, reply) => {
      const user = await authService.register(request.body);

      return reply.status(201).send({
        success: true,
        data: { user },
        message: 'Account created successfully',
      });
    }
  );

  // Login
  fastify.post(
    '/login',
    {
      preHandler: [validateBody(loginSchema)],
    },
    async (request, reply) => {
      const result = await authService.login(request.body, fastify);

      return reply.send({
        success: true,
        data: result,
        message: 'Login successful',
      });
    }
  );

  // Refresh access token
  fastify.post(
    '/refresh',
    {
      preHandler: [validateBody(refreshTokenSchema)],
    },
    async (request, reply) => {
      const { refreshToken } = request.body;
      const tokens = await authService.refreshAccessToken(refreshToken, fastify);

      return reply.send({
        success: true,
        data: tokens,
        message: 'Token refreshed',
      });
    }
  );

  // Logout
  fastify.post(
    '/logout',
    {
      preHandler: [authenticate, validateBody(refreshTokenSchema)],
    },
    async (request, reply) => {
      const { refreshToken } = request.body;
      await authService.logout(refreshToken);

      return reply.send({
        success: true,
        message: 'Logged out successfully',
      });
    }
  );

  // Change password
  fastify.post(
    '/change-password',
    {
      preHandler: [authenticate, validateBody(changePasswordSchema)],
    },
    async (request, reply) => {
      const { currentPassword, newPassword } = request.body;
      await authService.changePassword(
        request.user.id,
        currentPassword,
        newPassword
      );

      return reply.send({
        success: true,
        message: 'Password changed successfully',
      });
    }
  );

  // Get current user
  fastify.get(
    '/me',
    {
      preHandler: [authenticate],
    },
    async (request, reply) => {
      return reply.send({
        success: true,
        data: { user: request.user },
      });
    }
  );
}
