// Redis Client - Caching and session management
import Redis from 'ioredis';
import { config } from '../config/index.js';

let redisClient;

/**
 * Get Redis client instance
 * @returns {Redis}
 */
export const getRedisClient = () => {
  if (!redisClient) {
    redisClient = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      reconnectOnError: (err) => {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          return true;
        }
        return false;
      },
    });

    redisClient.on('connect', () => {
      console.log('✅ Redis connected');
    });

    redisClient.on('error', (err) => {
      console.error('❌ Redis error:', err.message);
    });

    // Handle graceful shutdown
    const cleanup = async () => {
      await redisClient.quit();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }

  return redisClient;
};

/**
 * Cache service with common operations
 */
export class CacheService {
  constructor() {
    this.client = getRedisClient();
    this.defaultTTL = 300; // 5 minutes
  }

  /**
   * Get value from cache
   * @param {string} key
   * @returns {Promise<any>}
   */
  async get(key) {
    const value = await this.client.get(key);
    return value ? JSON.parse(value) : null;
  }

  /**
   * Set value in cache with TTL
   * @param {string} key
   * @param {any} value
   * @param {number} ttl - Time to live in seconds
   * @returns {Promise<string>}
   */
  async set(key, value, ttl = this.defaultTTL) {
    return this.client.setex(key, ttl, JSON.stringify(value));
  }

  /**
   * Delete key from cache
   * @param {string} key
   * @returns {Promise<number>}
   */
  async del(key) {
    return this.client.del(key);
  }

  /**
   * Delete multiple keys matching pattern
   * @param {string} pattern
   * @returns {Promise<number>}
   */
  async delPattern(pattern) {
    const keys = await this.client.keys(pattern);
    if (keys.length > 0) {
      return this.client.del(...keys);
    }
    return 0;
  }

  /**
   * Check if key exists
   * @param {string} key
   * @returns {Promise<boolean>}
   */
  async exists(key) {
    const result = await this.client.exists(key);
    return result === 1;
  }

  /**
   * Set expiration on existing key
   * @param {string} key
   * @param {number} ttl - Time to live in seconds
   * @returns {Promise<number>}
   */
  async expire(key, ttl) {
    return this.client.expire(key, ttl);
  }

  /**
   * Increment value
   * @param {string} key
   * @returns {Promise<number>}
   */
  async incr(key) {
    return this.client.incr(key);
  }

  /**
   * Get remaining TTL
   * @param {string} key
   * @returns {Promise<number>}
   */
  async ttl(key) {
    return this.client.ttl(key);
  }
}

export default new CacheService();
