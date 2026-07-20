import { authenticate, requireUserType } from '../middleware/authenticate.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import {
  createFoodBankIndexRegionSchema,
  reviewFoodBankDirectoryChangeSchema,
  startFoodBankIndexRunSchema,
  uuidParamSchema,
} from '../utils/validators.js';
import foodBankDirectoryService from '../services/foodBankDirectoryService.js';
import { addFoodBankDirectorySyncJob } from '../queue/agentQueue.js';
import { triggerFoodBankDirectorySchedulerPass } from '../services/foodBankDirectoryScheduler.js';

export default async function foodBankDirectoryRoutes(fastify) {
  const staffOnly = [authenticate, requireUserType(['staff', 'admin'])];

  fastify.get('/food-bank-directory/status', {
    preHandler: staffOnly,
  }, async (_request, reply) => {
    const status = await foodBankDirectoryService.getStatus();
    return reply.send({ success: true, data: status });
  });

  fastify.get('/food-bank-directory/regions', {
    preHandler: staffOnly,
  }, async (_request, reply) => {
    const regions = await foodBankDirectoryService.listRegions();
    return reply.send({ success: true, data: { regions } });
  });

  fastify.post('/food-bank-directory/regions', {
    preHandler: [...staffOnly, validateBody(createFoodBankIndexRegionSchema)],
  }, async (request, reply) => {
    const region = await foodBankDirectoryService.createRegion(request.body);
    await triggerFoodBankDirectorySchedulerPass().catch(() => null);

    return reply.code(201).send({
      success: true,
      data: { region },
      message: 'Food bank index region created',
    });
  });

  fastify.get('/food-bank-directory/runs', {
    preHandler: staffOnly,
  }, async (request, reply) => {
    const limit = Number(request.query.limit || 25);
    const runs = await foodBankDirectoryService.listRuns(limit);
    return reply.send({ success: true, data: { runs } });
  });

  fastify.post('/food-bank-directory/runs/start', {
    preHandler: [...staffOnly, validateBody(startFoodBankIndexRunSchema)],
  }, async (request, reply) => {
    const run = await foodBankDirectoryService.createManualRun({
      regionId: request.body.regionId,
      initiatedBy: request.user.id,
    });
    const sessionId = `food-bank-directory-${request.body.regionId}-${Date.now()}`;
    const job = await addFoodBankDirectorySyncJob({
      runId: run.id,
      regionId: request.body.regionId,
      sessionId,
      userId: request.user.id,
      initiatedBy: request.user.id,
    });

    await foodBankDirectoryService.attachJobToRun(run.id, job.jobId);
    await foodBankDirectoryService.markRegionQueued(request.body.regionId);

    return reply.send({
      success: true,
      data: {
        runId: run.id,
        jobId: job.jobId,
        sessionId,
      },
      message: 'Food bank directory sync started',
    });
  });

  fastify.post('/food-bank-directory/scheduler/trigger', {
    preHandler: staffOnly,
  }, async (_request, reply) => {
    const queued = await triggerFoodBankDirectorySchedulerPass();
    return reply.send({
      success: true,
      data: { queued: queued || 0 },
      message: 'Scheduler pass triggered',
    });
  });

  fastify.get('/food-bank-directory/entries', {
    preHandler: staffOnly,
  }, async (request, reply) => {
    const entries = await foodBankDirectoryService.listEntries(request.query);
    return reply.send({ success: true, data: { entries } });
  });

  fastify.get('/food-bank-directory/review-queue', {
    preHandler: staffOnly,
  }, async (request, reply) => {
    const limit = Number(request.query.limit || 100);
    const changes = await foodBankDirectoryService.listReviewQueue(limit);
    return reply.send({ success: true, data: { changes } });
  });

  fastify.post('/food-bank-directory/review/:id/approve', {
    preHandler: [...staffOnly, validateParams(uuidParamSchema), validateBody(reviewFoodBankDirectoryChangeSchema)],
  }, async (request, reply) => {
    const change = await foodBankDirectoryService.approveChange(
      request.params.id,
      request.user.id,
      request.body.notes
    );
    return reply.send({
      success: true,
      data: { change },
      message: 'Directory change approved',
    });
  });

  fastify.post('/food-bank-directory/review/:id/reject', {
    preHandler: [...staffOnly, validateParams(uuidParamSchema), validateBody(reviewFoodBankDirectoryChangeSchema)],
  }, async (request, reply) => {
    const change = await foodBankDirectoryService.rejectChange(
      request.params.id,
      request.user.id,
      request.body.notes
    );
    return reply.send({
      success: true,
      data: { change },
      message: 'Directory change rejected',
    });
  });
}
