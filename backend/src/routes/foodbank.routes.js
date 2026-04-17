// Food Bank Routes - Phase 2
import foodbankService from '../services/foodbank.service.js';
import { authenticate } from '../middleware/authenticate.js';

export default async function foodbankRoutes(fastify, options) {
  // GET /api/food-banks - Get all food banks
  fastify.get('/', async (request, reply) => {
    const { city, state, type, limit, offset } = request.query;

    const foodBanks = await foodbankService.getAll({
      city,
      state,
      type,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
    });

    return reply.send({
      success: true,
      data: { foodBanks, count: foodBanks.length },
    });
  });

  // GET /api/food-banks/nearby - Find nearby food banks
  fastify.get('/nearby', async (request, reply) => {
    const { latitude, longitude, radius, limit } = request.query;

    if (!latitude || !longitude) {
      return reply.code(400).send({
        success: false,
        error: 'Latitude and longitude are required',
      });
    }

    const foodBanks = await foodbankService.findNearby({
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      radiusMiles: radius ? parseFloat(radius) : 10,
      limit: limit ? parseInt(limit) : 20,
    });

    return reply.send({
      success: true,
      data: { foodBanks, count: foodBanks.length },
    });
  });

  // GET /api/food-banks/:id - Get food bank by ID
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params;
    const foodBank = await foodbankService.getStatus(id);

    return reply.send({
      success: true,
      data: { foodBank },
    });
  });

  // GET /api/food-banks/:id/status - Get food bank status
  fastify.get('/:id/status', async (request, reply) => {
    const { id } = request.params;
    const foodBank = await foodbankService.getStatus(id);

    return reply.send({
      success: true,
      data: {
        status: foodBank.status,
        foodNeeds: foodBank.foodNeeds,
      },
    });
  });

  // PUT /api/food-banks/:id/status - Update food bank status (authenticated)
  fastify.put(
    '/:id/status',
    {
      preHandler: authenticate,
    },
    async (request, reply) => {
      const { id } = request.params;
      const statusData = request.body;
      const userId = request.user.userId;

      const status = await foodbankService.updateStatus(id, statusData, userId);

      return reply.send({
        success: true,
        data: { status },
        message: 'Food bank status updated successfully',
      });
    }
  );
}
