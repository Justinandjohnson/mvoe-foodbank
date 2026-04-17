// Agent API Routes
import { addMealPlannerJob, getJobStatus, getActiveJobs } from '../queue/agentQueue.js';
import { authenticate } from '../middleware/authenticate.js';

async function agentRoutes(fastify) {
  // Start meal planning agent
  fastify.post('/agents/meal-planner/start', { preHandler: authenticate }, async (request, reply) => {
    try {
      const { request: userRequest } = request.body;

      if (!userRequest || !userRequest.trim()) {
        return reply.code(400).send({
          success: false,
          error: 'Request text is required'
        });
      }

      // Generate session ID for WebSocket communication
      const sessionId = `session-${request.user.id}-${Date.now()}`;

      // Add job to queue
      const job = await addMealPlannerJob({
        userId: request.user.id,
        sessionId,
        request: userRequest
      });

      return reply.send({
        success: true,
        jobId: job.jobId,
        sessionId,
        status: job.status,
        message: 'Meal planning agent started'
      });

    } catch (error) {
      console.error('Error starting meal planner:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to start meal planning agent'
      });
    }
  });

  // Get agent job status
  fastify.get('/agents/status/:jobId', { preHandler: authenticate }, async (request, reply) => {
    try {
      const { jobId } = request.params;

      const status = await getJobStatus(jobId);

      return reply.send({
        success: true,
        ...status
      });

    } catch (error) {
      console.error('Error getting job status:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to get job status'
      });
    }
  });

  // Get all active agent jobs
  fastify.get('/agents/active', { preHandler: authenticate }, async (request, reply) => {
    try {
      const jobs = await getActiveJobs();

      return reply.send({
        success: true,
        jobs
      });

    } catch (error) {
      console.error('Error getting active jobs:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to get active jobs'
      });
    }
  });

  // Test USDA API connection
  fastify.get('/agents/test/usda', { preHandler: authenticate }, async (request, reply) => {
    try {
      const { default: USDAClient } = await import('../mcp/usdaClient.js');
      const usdaClient = new USDAClient();

      // Test search
      const result = await usdaClient.request({
        method: 'usda_search_foods',
        params: { query: 'apple', pageSize: 5 }
      });

      return reply.send({
        success: true,
        testResult: result,
        message: 'USDA API connection test'
      });

    } catch (error) {
      console.error('USDA test error:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });
}

export default agentRoutes;
