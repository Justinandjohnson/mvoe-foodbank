// User Routes - User profile endpoints
import userService from '../services/user.service.js';
import { authenticate } from '../middleware/authenticate.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { updateProfileSchema, paginationSchema } from '../utils/validators.js';

export default async function userRoutes(fastify) {
  // Get user profile
  fastify.get(
    '/profile',
    {
      preHandler: [authenticate],
    },
    async (request, reply) => {
      const user = await userService.getUserProfile(request.user.id);

      return reply.send({
        success: true,
        data: { user },
      });
    }
  );

  // Update user profile
  fastify.put(
    '/profile',
    {
      preHandler: [authenticate, validateBody(updateProfileSchema)],
    },
    async (request, reply) => {
      const user = await userService.updateUserProfile(
        request.user.id,
        request.body
      );

      return reply.send({
        success: true,
        data: { user },
        message: 'Profile updated successfully',
      });
    }
  );

  // Get user donation history
  fastify.get(
    '/donations',
    {
      preHandler: [authenticate, validateQuery(paginationSchema)],
    },
    async (request, reply) => {
      const result = await userService.getUserDonations(
        request.user.id,
        request.query
      );

      return reply.send({
        success: true,
        data: result,
      });
    }
  );

  // Get user statistics
  fastify.get(
    '/stats',
    {
      preHandler: [authenticate],
    },
    async (request, reply) => {
      const stats = await userService.getUserStatistics(request.user.id);

      return reply.send({
        success: true,
        data: { stats },
      });
    }
  );

  // Delete account
  fastify.delete(
    '/account',
    {
      preHandler: [authenticate],
    },
    async (request, reply) => {
      await userService.deleteUser(request.user.id);

      return reply.send({
        success: true,
        message: 'Account deleted successfully',
      });
    }
  );
}
