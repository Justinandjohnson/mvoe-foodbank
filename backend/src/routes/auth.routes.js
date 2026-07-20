// Auth Routes - Authentication endpoints
import { z } from 'zod';
import authService from '../services/auth.service.js';
import { validateBody } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import {
  signupSchema,
  loginSchema,
  refreshTokenSchema,
  changePasswordSchema,
} from '../utils/validators.js';

const googleLoginSchema = z.object({
  idToken: z.string().min(1, 'Google ID token is required'),
  userType: z.enum(['donor', 'volunteer']).optional(),
});

export default async function authRoutes(fastify) {
  // Register new user
  fastify.post(
    '/signup',
    {
      preHandler: [validateBody(signupSchema)],
    },
    async (request, reply) => {
      const result = await authService.registerAndIssueTokens(request.body, fastify);

      return reply.status(201).send({
        success: true,
        data: result,
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

  // Google ID token login
  fastify.post(
    '/google',
    {
      preHandler: [validateBody(googleLoginSchema)],
    },
    async (request, reply) => {
      const result = await authService.loginWithGoogle(request.body, fastify);

      return reply.send({
        success: true,
        data: result,
        message: 'Google login successful',
      });
    }
  );

  // Logout
  fastify.post(
    '/logout',
    {
      preHandler: [validateBody(refreshTokenSchema)],
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
