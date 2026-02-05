import Redis from 'ioredis';
import { config } from '../config/index.js';
import { logger } from './logger.js';

// =============================================================================
// Redis Client
// =============================================================================

let redis: Redis | null = null;

export const getRedisClient = (): Redis | null => {
  if (!config.redis.url) {
    logger.warn('Redis URL not configured, caching disabled');
    return null;
  }

  if (!redis) {
    redis = new Redis(config.redis.url, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) {
          logger.error('Redis connection failed after 3 retries');
          return null;
        }
        return Math.min(times * 100, 3000);
      },
      lazyConnect: true,
    });

    redis.on('connect', () => {
      logger.info('Redis connected successfully');
    });

    redis.on('error', (error) => {
      logger.error({ error }, 'Redis connection error');
    });

    redis.on('close', () => {
      logger.warn('Redis connection closed');
    });
  }

  return redis;
};

// =============================================================================
// Connection Management
// =============================================================================

export const connectRedis = async (): Promise<void> => {
  const client = getRedisClient();
  if (client) {
    try {
      await client.connect();
    } catch (error) {
      logger.error({ error }, 'Failed to connect to Redis');
    }
  }
};

export const disconnectRedis = async (): Promise<void> => {
  if (redis) {
    try {
      await redis.quit();
      redis = null;
      logger.info('Redis disconnected');
    } catch (error) {
      logger.error({ error }, 'Error disconnecting Redis');
    }
  }
};

// =============================================================================
// Health Check
// =============================================================================

export const isRedisHealthy = async (): Promise<boolean> => {
  const client = getRedisClient();
  if (!client) {
    return false;
  }

  try {
    const pong = await client.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
};

// =============================================================================
// Cache Utilities
// =============================================================================

const DEFAULT_TTL = 300; // 5 minutes

export const cacheGet = async <T>(key: string): Promise<T | null> => {
  const client = getRedisClient();
  if (!client) {
    return null;
  }

  try {
    const value = await client.get(key);
    if (!value) {
      return null;
    }
    return JSON.parse(value) as T;
  } catch (error) {
    logger.error({ error, key }, 'Cache get error');
    return null;
  }
};

export const cacheSet = async <T>(
  key: string,
  value: T,
  ttlSeconds: number = DEFAULT_TTL
): Promise<void> => {
  const client = getRedisClient();
  if (!client) {
    return;
  }

  try {
    await client.setex(key, ttlSeconds, JSON.stringify(value));
  } catch (error) {
    logger.error({ error, key }, 'Cache set error');
  }
};

export const cacheDelete = async (key: string): Promise<void> => {
  const client = getRedisClient();
  if (!client) {
    return;
  }

  try {
    await client.del(key);
  } catch (error) {
    logger.error({ error, key }, 'Cache delete error');
  }
};

export const cacheDeletePattern = async (pattern: string): Promise<void> => {
  const client = getRedisClient();
  if (!client) {
    return;
  }

  try {
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(...keys);
    }
  } catch (error) {
    logger.error({ error, pattern }, 'Cache delete pattern error');
  }
};
