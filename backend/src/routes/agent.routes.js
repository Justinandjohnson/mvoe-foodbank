// Agent API Routes
// ponytail: lazy-import queue functions — agentQueue.js creates Redis connection at load time
const queueUnavailable = (reply) => reply.code(503).send({ success: false, error: 'Agent queue unavailable (no Redis)' });
let _queue;
const getQueue = async () => {
  if (!_queue) _queue = await import('../queue/agentQueue.js');
  return _queue;
};
import { authenticate, optionalAuth } from '../middleware/authenticate.js';
import { optionalActor, requireActor } from '../middleware/actor.js';
import { checkGuestRateLimit, getClientAddress, getGuestAccessToken } from './agentRouteUtils.js';
import { getGrantIndexSnapshot, refreshGrantIndex } from '../services/grantIndexService.js';
import { listRecentAgentActivity } from '../services/agentActivityService.js';
import {
  beginGrantDriveConnection,
  createGrantWorkspace,
  getGrantDriveStatus,
  getGrantWorkspace,
  handleGrantDriveCallback,
  listGrantWorkspaces,
  reviewGrantDraft,
  runGrantWorkspaceTurn,
  selectGrantOpportunity,
  syncGrantDraftToDrive,
  updateGrantDraft,
  updateGrantWorkspace,
} from '../services/grantWorkspaceService.js';
import pricingIndexService from '../services/pricingIndexService.js';
import { config } from '../config/index.js';
import { isComposioConfigured } from '../services/composioService.js';
import { getZenRuntimeStatus } from '../mcp/zenClient.js';

async function agentRoutes(fastify) {
  const sendGrantWorkspaceError = (reply, error, fallbackMessage) => {
    console.error(fallbackMessage, error);
    const statusCode = error.statusCode || 500;
    return reply.code(statusCode).send({
      success: false,
      error: error.message || fallbackMessage,
      code: error.code || null,
      statusCode,
    });
  };

  // Start meal planning agent
  fastify.post('/agents/meal-planner/start', { preHandler: authenticate }, async (request, reply) => {
    try {
      const { request: userRequest } = request.body;
      const options = request.body?.options || {};

      if (!userRequest || !userRequest.trim()) {
        return reply.code(400).send({
          success: false,
          error: 'Request text is required'
        });
      }

      // Generate session ID for WebSocket communication
      const sessionId = `session-${request.user.id}-${Date.now()}`;

      // Add job to queue
      const job = await (await getQueue()).addMealPlannerJob({
        userId: request.user.id,
        sessionId,
        request: userRequest,
        options: {
          forceRefreshPricing: Boolean(options.forceRefreshPricing),
        },
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

  fastify.get('/agents/meal-planner/pricing-status', async (_request, reply) => {
    try {
      const status = await pricingIndexService.getStatus();
      return reply.send({
        success: true,
        data: status,
      });
    } catch (error) {
      console.error('Error getting meal planner pricing status:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to get meal planner pricing status',
      });
    }
  });

  fastify.post('/agents/meal-planner/pricing-index/refresh', {
    preHandler: [optionalActor],
  }, async (request, reply) => {
    try {
      if (!config.firecrawlApiKey) {
        return reply.code(503).send({
          success: false,
          error: 'FIRECRAWL_API_KEY is not configured',
        });
      }

      const refresh = await pricingIndexService.refreshStapleCatalog({
        trigger: 'manual',
        requestedBy: request.user?.id || request.actor?.sessionId || 'anonymous-session',
        forceFresh: true,
      });
      const status = await pricingIndexService.getStatus();

      return reply.send({
        success: true,
        data: {
          ...status,
          runId: refresh.runId,
          updatedCount: refresh.updatedCount,
          failedCount: refresh.failedCount,
        },
        message: 'Meal planner pricing index refreshed',
      });
    } catch (error) {
      console.error('Error refreshing meal planner pricing index:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to refresh meal planner pricing index',
      });
    }
  });

  // Get agent job status
  fastify.get('/agents/status/:jobId', { preHandler: authenticate }, async (request, reply) => {
    try {
      const { jobId } = request.params;

      const status = await (await getQueue()).getJobStatus(jobId);

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

  fastify.post('/agents/meal-planner/guest/start', { preHandler: optionalAuth }, async (request, reply) => {
    try {
      const { request: userRequest } = request.body;
      const options = request.body?.options || {};

      if (!userRequest || !userRequest.trim()) {
        return reply.code(400).send({
          success: false,
          error: 'Request text is required'
        });
      }

      const clientIp = getClientAddress(request);
      if (!checkGuestRateLimit(clientIp)) {
        return reply.code(429).send({
          success: false,
          error: 'Guest meal planner limit reached. Please wait before trying again.'
        });
      }

      const sessionId = `guest-session-${Date.now()}`;
      const job = await (await getQueue()).addGuestMealPlannerJob({
        userId: request.user?.id || null,
        sessionId,
        request: userRequest,
        guestIp: clientIp,
        options: {
          forceRefreshPricing: Boolean(options.forceRefreshPricing),
        },
      });

      return reply.send({
        success: true,
        jobId: job.jobId,
        accessToken: job.accessToken,
        sessionId,
        status: job.status,
        message: 'Guest meal planning agent started'
      });
    } catch (error) {
      console.error('Error starting guest meal planner:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to start guest meal planning agent'
      });
    }
  });

  fastify.get('/agents/meal-planner/guest/status/:jobId', async (request, reply) => {
    try {
      const { jobId } = request.params;
      const accessToken = getGuestAccessToken(request);
      const status = await (await getQueue()).getGuestJobStatus(jobId, accessToken);

      if (status.status === 'forbidden') {
        return reply.code(403).send({
          success: false,
          error: status.failedReason,
        });
      }

      return reply.send({
        success: true,
        ...status,
      });
    } catch (error) {
      console.error('Error getting guest job status:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to get guest meal planner status'
      });
    }
  });

  fastify.post('/agents/grant-writer/start', { preHandler: authenticate }, async (request, reply) => {
    try {
      const { request: grantRequest } = request.body;

      if (!grantRequest || !grantRequest.organizationName || !grantRequest.projectNeed) {
        return reply.code(400).send({
          success: false,
          error: 'organizationName and projectNeed are required'
        });
      }

      const sessionId = `grant-writer-${request.user.id}-${Date.now()}`;
      const job = await (await getQueue()).addGrantWriterJob({
        userId: request.user.id,
        sessionId,
        request: grantRequest,
      });

      return reply.send({
        success: true,
        jobId: job.jobId,
        sessionId,
        status: job.status,
        message: 'Grant writer agent started'
      });
    } catch (error) {
      console.error('Error starting grant writer:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to start grant writer agent'
      });
    }
  });

  fastify.post('/agents/grant-writer/guest/start', { preHandler: [optionalAuth] }, async (request, reply) => {
    try {
      const { request: grantRequest } = request.body;

      if (!grantRequest || !grantRequest.organizationName || !grantRequest.projectNeed) {
        return reply.code(400).send({
          success: false,
          error: 'organizationName and projectNeed are required',
        });
      }

      const sessionId = `guest-grant-writer-${Date.now()}`;
      const job = await (await getQueue()).addGuestGrantWriterJob({
        userId: request.user?.id || null,
        sessionId,
        request: grantRequest,
        guestIp: getClientAddress(request),
      });

      return reply.send({
        success: true,
        jobId: job.jobId,
        accessToken: job.accessToken,
        sessionId,
        status: job.status,
        message: 'Guest grant writer agent started',
      });
    } catch (error) {
      console.error('Error starting guest grant writer:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to start grant writer agent',
      });
    }
  });

  fastify.get('/agents/grant-writer/guest/status/:jobId', async (request, reply) => {
    try {
      const { jobId } = request.params;
      const accessToken = getGuestAccessToken(request);
      const status = await (await getQueue()).getGuestJobStatus(jobId, accessToken);

      if (status.status === 'forbidden') {
        return reply.code(403).send({
          success: false,
          error: status.failedReason,
        });
      }

      return reply.send({
        success: true,
        ...status,
      });
    } catch (error) {
      console.error('Error getting guest grant writer status:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to get guest grant writer status',
      });
    }
  });

  fastify.get('/agents/grant-writer/index-status', async (request, reply) => {
    try {
      const snapshot = await getGrantIndexSnapshot();
      return reply.send({
        success: true,
        snapshot,
        runtime: {
          ai: getZenRuntimeStatus(),
          drive: {
            configured: isComposioConfigured(),
            provider: 'composio',
            message: isComposioConfigured()
              ? 'Composio is configured for Google Drive connections.'
              : 'COMPOSIO_API_KEY is not configured, so Google Drive sync is offline.',
          },
        },
      });
    } catch (error) {
      console.error('Error getting grant index status:', error);
      return reply.code(500).send({ success: false, error: 'Failed to get grant index status' });
    }
  });

  fastify.post('/agents/grant-writer/index-refresh', async (request, reply) => {
    try {
      const snapshot = await refreshGrantIndex();
      return reply.send({
        success: true,
        snapshot,
        runtime: {
          ai: getZenRuntimeStatus(),
          drive: {
            configured: isComposioConfigured(),
            provider: 'composio',
            message: isComposioConfigured()
              ? 'Composio is configured for Google Drive connections.'
              : 'COMPOSIO_API_KEY is not configured, so Google Drive sync is offline.',
          },
        },
        message: 'Grant index refreshed',
      });
    } catch (error) {
      console.error('Error refreshing grant index:', error);
      return reply.code(500).send({ success: false, error: 'Failed to refresh grant index' });
    }
  });

  fastify.get('/agents/grant-writer/workspaces', { preHandler: [requireActor] }, async (request, reply) => {
    try {
      const workspaces = await listGrantWorkspaces(request.actor);
      return reply.send({ success: true, workspaces });
    } catch (error) {
      return sendGrantWorkspaceError(reply, error, 'Failed to load grant workspaces');
    }
  });

  fastify.post('/agents/grant-writer/workspaces', { preHandler: [requireActor] }, async (request, reply) => {
    try {
      const workspace = await createGrantWorkspace(request.actor, request.body || {});
      return reply.send({ success: true, workspace });
    } catch (error) {
      return sendGrantWorkspaceError(reply, error, 'Failed to create grant workspace');
    }
  });

  fastify.get('/agents/grant-writer/workspaces/:workspaceId', { preHandler: [requireActor] }, async (request, reply) => {
    try {
      const workspace = await getGrantWorkspace(request.actor, request.params.workspaceId);
      return reply.send({ success: true, workspace });
    } catch (error) {
      return sendGrantWorkspaceError(reply, error, 'Failed to load grant workspace');
    }
  });

  fastify.patch('/agents/grant-writer/workspaces/:workspaceId', { preHandler: [requireActor] }, async (request, reply) => {
    try {
      const workspace = await updateGrantWorkspace(request.actor, request.params.workspaceId, request.body || {});
      return reply.send({ success: true, workspace });
    } catch (error) {
      return sendGrantWorkspaceError(reply, error, 'Failed to update grant workspace');
    }
  });

  fastify.post('/agents/grant-writer/workspaces/:workspaceId/messages', { preHandler: [requireActor] }, async (request, reply) => {
    try {
      const workspace = await runGrantWorkspaceTurn(request.actor, request.params.workspaceId, request.body || {});
      return reply.code(202).send({ success: true, workspace });
    } catch (error) {
      return sendGrantWorkspaceError(reply, error, 'Failed to run grant writer workspace turn');
    }
  });

  fastify.post('/agents/grant-writer/workspaces/:workspaceId/select-opportunity', { preHandler: [requireActor] }, async (request, reply) => {
    try {
      const workspace = await selectGrantOpportunity(
        request.actor,
        request.params.workspaceId,
        request.body?.opportunity
      );
      return reply.send({ success: true, workspace });
    } catch (error) {
      return sendGrantWorkspaceError(reply, error, 'Failed to select grant opportunity');
    }
  });

  fastify.post('/agents/grant-writer/workspaces/:workspaceId/drafts/:draftId/review', { preHandler: [requireActor] }, async (request, reply) => {
    try {
      const workspace = await reviewGrantDraft(
        request.actor,
        request.params.workspaceId,
        request.params.draftId,
        request.body || {}
      );
      return reply.send({ success: true, workspace });
    } catch (error) {
      return sendGrantWorkspaceError(reply, error, 'Failed to review grant draft');
    }
  });

  fastify.patch('/agents/grant-writer/workspaces/:workspaceId/drafts/:draftId', { preHandler: [requireActor] }, async (request, reply) => {
    try {
      const workspace = await updateGrantDraft(
        request.actor,
        request.params.workspaceId,
        request.params.draftId,
        request.body || {}
      );
      return reply.send({ success: true, workspace });
    } catch (error) {
      return sendGrantWorkspaceError(reply, error, 'Failed to update grant draft');
    }
  });

  fastify.get('/agents/grant-writer/workspaces/:workspaceId/drive/status', { preHandler: [requireActor] }, async (request, reply) => {
    try {
      const connection = await getGrantDriveStatus(request.actor, request.params.workspaceId);
      return reply.send({ success: true, connection });
    } catch (error) {
      return sendGrantWorkspaceError(reply, error, 'Failed to load grant drive status');
    }
  });

  fastify.post('/agents/grant-writer/workspaces/:workspaceId/drive/connect', { preHandler: [requireActor] }, async (request, reply) => {
    try {
      const baseUrl = `${request.protocol}://${request.headers.host}`;
      const callbackUrl = `${baseUrl}/api/agents/grant-writer/workspaces/${request.params.workspaceId}/drive/callback`;
      const connection = await beginGrantDriveConnection(request.actor, request.params.workspaceId, callbackUrl);
      return reply.send({
        success: true,
        connection: connection.connection,
        redirectUrl: connection.redirectUrl,
      });
    } catch (error) {
      return sendGrantWorkspaceError(reply, error, 'Failed to start Google Drive connection');
    }
  });

  fastify.get('/agents/grant-writer/workspaces/:workspaceId/drive/callback', async (request, reply) => {
    try {
      await handleGrantDriveCallback(request.params.workspaceId, {
        status: request.query.status,
        connectedAccountId: request.query.connected_account_id,
        errorMessage: request.query.error || request.query.status_reason || null,
      });

      reply.header('content-type', 'text/html; charset=utf-8');
      return reply.send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>MVOE Drive Connected</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif; background: #07121f; color: white; display: grid; place-items: center; min-height: 100vh; margin: 0; }
      .card { width: min(520px, 92vw); padding: 28px; border-radius: 24px; background: rgba(15, 23, 42, 0.88); border: 1px solid rgba(255,255,255,0.14); box-shadow: 0 20px 60px rgba(0,0,0,0.35); }
      h1 { margin: 0 0 12px; font-size: 28px; }
      p { margin: 0 0 14px; line-height: 1.55; color: rgba(255,255,255,0.82); }
      .status { color: #86efac; font-weight: 700; }
    </style>
  </head>
  <body>
    <div class="card">
      <p class="status">Google Drive connected</p>
      <h1>MVOE can now save grant drafts to your Drive.</h1>
      <p>You can close this tab and return to the grant workspace. The main app will pick up the updated connection status when it refreshes.</p>
    </div>
  </body>
</html>`);
    } catch (error) {
      reply.header('content-type', 'text/html; charset=utf-8');
      return reply.code(500).send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>MVOE Drive Connection Failed</title>
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif; background: #07121f; color: white; display: grid; place-items: center; min-height: 100vh; margin: 0;">
    <div style="width:min(520px,92vw); padding:28px; border-radius:24px; background:rgba(15,23,42,0.88); border:1px solid rgba(255,255,255,0.14);">
      <p style="color:#fca5a5; font-weight:700;">Drive connection failed</p>
      <h1 style="margin:0 0 12px; font-size:28px;">MVOE could not complete the Google Drive connection.</h1>
      <p style="line-height:1.55; color:rgba(255,255,255,0.82);">${error.message || 'Try the connection flow again from the grant workspace.'}</p>
    </div>
  </body>
</html>`);
    }
  });

  fastify.post('/agents/grant-writer/workspaces/:workspaceId/drafts/:draftId/drive/sync', { preHandler: [requireActor] }, async (request, reply) => {
    try {
      const workspace = await syncGrantDraftToDrive(
        request.actor,
        request.params.workspaceId,
        request.params.draftId
      );
      return reply.send({ success: true, workspace });
    } catch (error) {
      return sendGrantWorkspaceError(reply, error, 'Failed to sync grant draft to Google Drive');
    }
  });

  // Get all active agent jobs
  fastify.get('/agents/active', { preHandler: authenticate }, async (request, reply) => {
    try {
      const jobs = await (await getQueue()).getActiveJobs();

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

  fastify.get('/agents/activity', { preHandler: authenticate }, async (request, reply) => {
    try {
      const limit = Number(request.query.limit || 50);
      const entries = await listRecentAgentActivity(limit);

      return reply.send({
        success: true,
        entries,
      });
    } catch (error) {
      console.error('Error getting agent activity:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to get agent activity',
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
