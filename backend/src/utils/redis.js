// Redis Client - Caching and session management
// ponytail: in-memory fallback so demo runs without Redis
import { config } from '../config/index.js';
import Redis from 'ioredis';

let redisClient;

const memCache = new Map();
const memoryClient = {
  get: async (k) => { const v = memCache.get(k); return v?.exp && v.exp < Date.now() ? (memCache.delete(k), null) : (v?.val ?? null); },
  setex: async (k, ttl, v) => { memCache.set(k, { val: v, exp: Date.now() + ttl * 1000 }); return 'OK'; },
  del: async (...keys) => { let c = 0; keys.flat().forEach(k => { if (memCache.delete(k)) c++; }); return c; },
  keys: async (pattern) => { const re = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$'); return [...memCache.keys()].filter(k => re.test(k)); },
  exists: async (k) => memCache.has(k) ? 1 : 0,
  expire: async () => 1,
  incr: async (k) => { const v = (parseInt(memCache.get(k)?.val) || 0) + 1; memCache.set(k, { val: String(v) }); return v; },
  ttl: async () => -1,
  ping: async () => 'PONG',
  quit: async () => {},
  on: () => memoryClient,
};

/**
 * Get Redis client instance (or in-memory fallback)
 * @returns {Redis}
 */
export const getRedisClient = () => {
  if (redisClient) return redisClient;

  if (!config.redisUrl) {
    console.log('⚠️  Redis not configured — using in-memory cache');
    redisClient = memoryClient;
    return redisClient;
  }

  try {
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
      if (redisClient !== memoryClient) {
        console.log('⚠️  Falling back to in-memory cache');
        redisClient = memoryClient;
      }
    });
  } catch {
    console.log('⚠️  Redis unavailable — using in-memory cache');
    redisClient = memoryClient;
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

const cacheService = {
  defaultTTL: 300,

  async get(key) {
    const value = await getRedisClient().get(key);
    return value ? JSON.parse(value) : null;
  },

  async set(key, value, ttl = 300) {
    return getRedisClient().setex(key, ttl, JSON.stringify(value));
  },

  async del(key) {
    return getRedisClient().del(key);
  },

  async delPattern(pattern) {
    const client = getRedisClient();
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      return client.del(...keys);
    }
    return 0;
  },

  async exists(key) {
    const result = await getRedisClient().exists(key);
    return result === 1;
  },

  async expire(key, ttl) {
    return getRedisClient().expire(key, ttl);
  },

  async incr(key) {
    return getRedisClient().incr(key);
  },

  async ttl(key) {
    return getRedisClient().ttl(key);
  },
};

export default cacheService;
