// Main Server - Fastify application
import Fastify from 'fastify';
import { pathToFileURL } from 'node:url';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { config, getProductionReadiness, isDevelopment } from './config/index.js';
import { testConnection } from './utils/database.js';
import { getRedisClient } from './utils/redis.js';
import logger from './utils/logger.js';
import { errorHandler } from './utils/errors.js';

// Routes
import authRoutes from './routes/auth.routes.js';
import donationRoutes from './routes/donation.routes.js';
import organizationRoutes from './routes/organization.routes.js';
import ledgerRoutes from './routes/ledger.routes.js';
import userRoutes from './routes/user.routes.js';
import beaconRoutes from './routes/beacon.routes.js';
import foodbankRoutes from './routes/foodbank.routes.js';
import communityRoutes from './routes/community.routes.js';
import mapRoutes from './routes/map.routes.js';
import foodBankDirectoryRoutes from './routes/foodBankDirectory.routes.js';
import agentRoutes from './routes/agent.routes.js';
import receiptRoutes from './routes/receipt.routes.js';
import imageRoutes from './routes/images.routes.js';
import reportsRoutes from './routes/reports.routes.js';
import safetyRoutes from './routes/safety.routes.js';

// ponytail: agent system uses BullMQ/Redis — lazy import so demo mode doesn't crash
import { Server as SocketIOServer } from 'socket.io';
// ponytail: scheduler imports removed — lazy loaded below

function buildDevelopmentOrigins(frontendUrl) {
  const defaults = [
    'http://localhost:8081',
    'http://localhost:8082',
    'http://localhost:8083',
    'http://localhost:19006',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
  ];

  return Array.from(new Set([frontendUrl, ...defaults].filter(Boolean)));
}

// Create Fastify instance
const fastify = Fastify({
  logger: isDevelopment()
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        },
      }
    : true,
});

/**
 * Register plugins
 */
async function registerPlugins() {
  // Security
  await fastify.register(helmet, {
    contentSecurityPolicy: isDevelopment() ? false : undefined,
  });

  // CORS
  await fastify.register(cors, {
    origin: isDevelopment()
      ? buildDevelopmentOrigins(config.frontendUrl)
      : config.frontendUrl,
    credentials: true,
  });

  // JWT
  await fastify.register(jwt, {
    secret: config.jwtSecret,
  });

  // Rate limiting (no redis store — in-memory is fine for demo)
  await fastify.register(rateLimit, {
    max: config.rateLimitMaxRequests,
    timeWindow: config.rateLimitWindowMs,
  });

  // Photo uploads
  await fastify.register(multipart, {
    limits: {
      fileSize: 5 * 1024 * 1024,
      files: 1,
    },
  });

  logger.info('✅ Plugins registered');
}

/**
 * Register routes
 */
async function registerRoutes() {
  // Health check
  fastify.get('/health', async () => {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: config.nodeEnv,
    };
  });

  fastify.get('/ready', async (request, reply) => {
    const readiness = getProductionReadiness();
    const checks = {
      database: false,
      redis: false,
      configuration: config.nodeEnv === 'production' ? readiness.ready : true,
    };

    try {
      checks.database = await testConnection();
    } catch (_error) {
      checks.database = false;
    }

    try {
      await getRedisClient().ping();
      checks.redis = true;
    } catch (_error) {
      checks.redis = false;
    }

    const ready = Object.values(checks).every(Boolean);
    return reply.code(ready ? 200 : 503).send({
      status: ready ? 'ready' : 'not_ready',
      environment: config.nodeEnv,
      checks,
      productionReadiness: readiness,
      timestamp: new Date().toISOString(),
    });
  });

  // API routes
  await fastify.register(authRoutes, { prefix: '/api/auth' });
  await fastify.register(donationRoutes, { prefix: '/api/donations' });
  await fastify.register(organizationRoutes, { prefix: '/api/organizations' });
  await fastify.register(ledgerRoutes, { prefix: '/api/ledger' });
  await fastify.register(userRoutes, { prefix: '/api/user' });
  await fastify.register(foodbankRoutes, { prefix: '/api/food-banks' });
  await fastify.register(beaconRoutes, { prefix: '/api/beacons' });
  await fastify.register(communityRoutes, { prefix: '/api' });
  await fastify.register(mapRoutes, { prefix: '/api' });
  await fastify.register(foodBankDirectoryRoutes, { prefix: '/api' });
  await fastify.register(agentRoutes, { prefix: '/api' });
  await fastify.register(receiptRoutes, { prefix: '/api' });
  await fastify.register(imageRoutes, { prefix: '/api' });
  await fastify.register(reportsRoutes, { prefix: '/api' });
  await fastify.register(safetyRoutes, { prefix: '/api' });

  logger.info('✅ Routes registered');
}

/**
 * Setup WebSocket server for real-time agent updates
 */
function setupWebSocket(server) {
  const io = new SocketIOServer(server, {
    cors: {
      origin: isDevelopment()
        ? buildDevelopmentOrigins(config.frontendUrl)
        : config.frontendUrl,
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    logger.info(`WebSocket client connected: ${socket.id}`);

    // Join session room
    socket.on('join-session', (sessionId) => {
      socket.join(sessionId);
      logger.info(`Client ${socket.id} joined session ${sessionId}`);
    });

    socket.on('disconnect', () => {
      logger.info(`WebSocket client disconnected: ${socket.id}`);
    });
  });

  logger.info('✅ WebSocket server setup complete');
  return io;
}

/**
 * Register error handler
 */
function registerErrorHandler() {
  fastify.setErrorHandler(errorHandler);
  logger.info('✅ Error handler registered');
}

/**
 * Start server
 */
async function start() {
  try {
    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      throw new Error('Database connection failed');
    }

    // Test Redis/memory cache
    const redis = getRedisClient();
    await redis.ping();

    // Register everything
    await registerPlugins();
    await registerRoutes();
    registerErrorHandler();

    // Start listening
    await fastify.listen({
      port: config.apiPort,
      host: config.apiHost,
    });

    // Setup WebSocket server
    const io = setupWebSocket(fastify.server);

    // ponytail: agent worker + schedulers need Redis/BullMQ — lazy import, skip in demo mode
    try {
      const { startAgentWorker } = await import('./workers/agentWorker.js');
      startAgentWorker(io);
      logger.info('✅ Agent worker started');
      const { startGrantIndexScheduler } = await import('./services/grantIndexService.js');
      startGrantIndexScheduler();
      const { startFoodBankDirectoryScheduler } = await import('./services/foodBankDirectoryScheduler.js');
      startFoodBankDirectoryScheduler();
      const { startPricingIndexScheduler } = await import('./services/pricingIndexService.js');
      startPricingIndexScheduler();
      logger.info('✅ Schedulers started');
    } catch (err) {
      logger.warn(`⚠️  Agent worker/schedulers skipped (demo mode): ${err.message}`);
    }

    logger.info(`🚀 Server running at http://${config.apiHost}:${config.apiPort}`);
    logger.info(`📝 Environment: ${config.nodeEnv}`);
    logger.info(`🔗 Frontend URL: ${config.frontendUrl}`);
    logger.info(`🤖 AI Agent system active`);
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
const gracefulShutdown = async () => {
  logger.info('Received shutdown signal, closing server...');

  try {
    try { const m = await import('./workers/agentWorker.js'); await m.stopAgentWorker(); } catch {}
    try { const m = await import('./services/grantIndexService.js'); m.stopGrantIndexScheduler(); } catch {}
    try { const m = await import('./services/foodBankDirectoryScheduler.js'); m.stopFoodBankDirectoryScheduler(); } catch {}
    try { const m = await import('./services/pricingIndexService.js'); m.stopPricingIndexScheduler(); } catch {}

    await fastify.close();
    logger.info('Server closed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  start();
}

export default fastify;
