// Main Server - Fastify application
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { config, isDevelopment } from './config/index.js';
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
import foodbankRoutes from './routes/foodbank.routes.js';
import communityRoutes from './routes/community.routes.js';
import agentRoutes from './routes/agent.routes.js';
import receiptRoutes from './routes/receipt.routes.js';
import reportsRoutes from './routes/reports.routes.js';

// Agent system
import { startAgentWorker, stopAgentWorker } from './workers/agentWorker.js';
import { Server as SocketIOServer } from 'socket.io';

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
      ? ['http://localhost:8081', 'http://localhost:8082', 'http://localhost:8083', 'http://localhost:19006', config.frontendUrl]
      : config.frontendUrl,
    credentials: true,
  });

  // JWT
  await fastify.register(jwt, {
    secret: config.jwtSecret,
  });

  // Rate limiting
  await fastify.register(rateLimit, {
    max: config.rateLimitMaxRequests,
    timeWindow: config.rateLimitWindowMs,
    redis: getRedisClient(),
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

  // API routes
  await fastify.register(authRoutes, { prefix: '/api/auth' });
  await fastify.register(donationRoutes, { prefix: '/api/donations' });
  await fastify.register(organizationRoutes, { prefix: '/api/organizations' });
  await fastify.register(ledgerRoutes, { prefix: '/api/ledger' });
  await fastify.register(userRoutes, { prefix: '/api/user' });
  await fastify.register(foodbankRoutes, { prefix: '/api/food-banks' });
  await fastify.register(communityRoutes, { prefix: '/api' });
  await fastify.register(agentRoutes, { prefix: '/api' });
  await fastify.register(receiptRoutes, { prefix: '/api' });
  await fastify.register(reportsRoutes, { prefix: '/api' });

  logger.info('✅ Routes registered');
}

/**
 * Setup WebSocket server for real-time agent updates
 */
function setupWebSocket(server) {
  const io = new SocketIOServer(server, {
    cors: {
      origin: isDevelopment()
        ? ['http://localhost:8081', 'http://localhost:8082', 'http://localhost:8083', 'http://localhost:19006', config.frontendUrl]
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

    // Test Redis connection
    const redis = getRedisClient();
    await redis.ping();
    logger.info('✅ Redis connected');

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

    // Start agent worker
    startAgentWorker(io);
    logger.info('✅ Agent worker started');

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
    // Stop agent worker
    await stopAgentWorker();

    // Close server
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

// Start the server
start();

export default fastify;
