// Donation Routes - Donation management endpoints
import donationService from '../services/donation.service.js';
import { authenticate } from '../middleware/authenticate.js';
import { validateBody, validateQuery, validateParams } from '../middleware/validate.js';
import {
  createDonationSchema,
  donationQuerySchema,
  uuidParamSchema,
} from '../utils/validators.js';

export default async function donationRoutes(fastify) {
  // Create donation
  fastify.post(
    '/',
    {
      preHandler: [authenticate, validateBody(createDonationSchema)],
    },
    async (request, reply) => {
      const result = await donationService.createDonation(
        request.body,
        request.user.id
      );

      return reply.status(201).send({
        success: true,
        data: result,
        message: 'Donation processed successfully',
      });
    }
  );

  // Get donations
  fastify.get(
    '/',
    {
      preHandler: [validateQuery(donationQuerySchema)],
    },
    async (request, reply) => {
      const result = await donationService.getDonations(request.query);

      return reply.send({
        success: true,
        data: result,
      });
    }
  );

  // Get single donation
  fastify.get(
    '/:id',
    {
      preHandler: [authenticate, validateParams(uuidParamSchema)],
    },
    async (request, reply) => {
      const donation = await donationService.getDonationById(
        request.params.id,
        request.user.id
      );

      return reply.send({
        success: true,
        data: { donation },
      });
    }
  );

  // Get donation statistics
  fastify.get('/stats/overall', async (request, reply) => {
    const { organizationId } = request.query;
    const stats = await donationService.getStatistics(organizationId);

    return reply.send({
      success: true,
      data: { stats },
    });
  });

  // Stripe webhook handler
  fastify.post('/webhook', async (request, reply) => {
    const sig = request.headers['stripe-signature'];

    try {
      const event = request.body; // Stripe already parsed by Fastify
      await donationService.handleWebhook(event);

      return reply.send({ received: true });
    } catch (error) {
      request.log.error('Webhook error:', error);
      return reply.status(400).send({
        success: false,
        error: 'Webhook processing failed',
      });
    }
  });
}
