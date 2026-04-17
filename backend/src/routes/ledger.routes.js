// Ledger Routes - Public transparency ledger endpoints
import ledgerService from '../services/ledger.service.js';
import { authenticate, requireAdmin } from '../middleware/authenticate.js';
import { validateBody, validateQuery, validateParams } from '../middleware/validate.js';
import {
  createLedgerEntrySchema,
  ledgerQuerySchema,
  uuidParamSchema,
} from '../utils/validators.js';

export default async function ledgerRoutes(fastify) {
  // Get public ledger (no auth required)
  fastify.get(
    '/public',
    {
      preHandler: [validateQuery(ledgerQuerySchema)],
    },
    async (request, reply) => {
      const result = await ledgerService.getPublicLedger(request.query);

      return reply.send({
        success: true,
        data: result,
      });
    }
  );

  // Create ledger entry (admin only)
  fastify.post(
    '/',
    {
      preHandler: [authenticate, requireAdmin, validateBody(createLedgerEntrySchema)],
    },
    async (request, reply) => {
      const entry = await ledgerService.createLedgerEntry(request.body);

      return reply.status(201).send({
        success: true,
        data: { entry },
        message: 'Ledger entry created',
      });
    }
  );

  // Get ledger entry by ID
  fastify.get(
    '/:id',
    {
      preHandler: [validateParams(uuidParamSchema)],
    },
    async (request, reply) => {
      const entry = await ledgerService.getLedgerEntryById(request.params.id);

      return reply.send({
        success: true,
        data: { entry },
      });
    }
  );

  // Get organization balance
  fastify.get(
    '/balance/:organizationId',
    {
      preHandler: [validateParams(uuidParamSchema.extend({ organizationId: uuidParamSchema.shape.id }))],
    },
    async (request, reply) => {
      const balance = await ledgerService.getBalance(request.params.organizationId);

      return reply.send({
        success: true,
        data: { balance },
      });
    }
  );

  // Get spending breakdown
  fastify.get(
    '/spending/:organizationId',
    {
      preHandler: [validateParams(uuidParamSchema.extend({ organizationId: uuidParamSchema.shape.id }))],
    },
    async (request, reply) => {
      const { startDate, endDate } = request.query;
      const breakdown = await ledgerService.getSpendingBreakdown(
        request.params.organizationId,
        startDate ? new Date(startDate) : null,
        endDate ? new Date(endDate) : null
      );

      return reply.send({
        success: true,
        data: { breakdown },
      });
    }
  );
}
