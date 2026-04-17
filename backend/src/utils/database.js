// Database Client - Prisma singleton with connection pooling
import { PrismaClient } from '@prisma/client';
import { config, isDevelopment } from '../config/index.js';

// Prisma client singleton
let prisma;

/**
 * Get Prisma client instance with optimized configuration
 * @returns {PrismaClient}
 */
export const getPrismaClient = () => {
  if (!prisma) {
    prisma = new PrismaClient({
      log: isDevelopment()
        ? ['query', 'info', 'warn', 'error']
        : ['warn', 'error'],
      errorFormat: 'pretty',
    });

    // Handle graceful shutdown
    const cleanup = async () => {
      await prisma.$disconnect();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }

  return prisma;
};

/**
 * Test database connection
 * @returns {Promise<boolean>}
 */
export const testConnection = async () => {
  try {
    const client = getPrismaClient();
    await client.$queryRaw`SELECT 1`;
    console.log('✅ Database connection established');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
};

/**
 * Transaction wrapper with automatic rollback
 * @param {Function} callback - Transaction operations
 * @returns {Promise<any>}
 */
export const transaction = async (callback) => {
  const client = getPrismaClient();
  return client.$transaction(callback);
};

export default getPrismaClient();
