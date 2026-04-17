// Organization Routes - Organization management endpoints
import organizationService from '../services/organization.service.js';
import { authenticate, requireAdmin } from '../middleware/authenticate.js';
import { validateBody, validateQuery, validateParams } from '../middleware/validate.js';
import {
  createOrganizationSchema,
  updateOrganizationSchema,
  paginationSchema,
  uuidParamSchema,
} from '../utils/validators.js';

export default async function organizationRoutes(fastify) {
  // Get all organizations
  fastify.get(
    '/',
    {
      preHandler: [validateQuery(paginationSchema)],
    },
    async (request, reply) => {
      const result = await organizationService.getOrganizations(request.query);

      return reply.send({
        success: true,
        data: result,
      });
    }
  );

  // Get organization by ID
  fastify.get(
    '/:id',
    {
      preHandler: [validateParams(uuidParamSchema)],
    },
    async (request, reply) => {
      const organization = await organizationService.getOrganizationById(
        request.params.id
      );

      return reply.send({
        success: true,
        data: { organization },
      });
    }
  );

  // Create organization
  fastify.post(
    '/',
    {
      preHandler: [authenticate, validateBody(createOrganizationSchema)],
    },
    async (request, reply) => {
      const organization = await organizationService.createOrganization(
        request.body
      );

      return reply.status(201).send({
        success: true,
        data: { organization },
        message: 'Organization created. Pending verification.',
      });
    }
  );

  // Update organization (admin only)
  fastify.put(
    '/:id',
    {
      preHandler: [
        authenticate,
        requireAdmin,
        validateParams(uuidParamSchema),
        validateBody(updateOrganizationSchema),
      ],
    },
    async (request, reply) => {
      const organization = await organizationService.updateOrganization(
        request.params.id,
        request.body
      );

      return reply.send({
        success: true,
        data: { organization },
        message: 'Organization updated successfully',
      });
    }
  );

  // Get organization statistics
  fastify.get(
    '/:id/stats',
    {
      preHandler: [validateParams(uuidParamSchema)],
    },
    async (request, reply) => {
      const stats = await organizationService.getStatistics(request.params.id);

      return reply.send({
        success: true,
        data: { stats },
      });
    }
  );
}
