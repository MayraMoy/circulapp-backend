// config/redis.js
const redis = require('redis');

class RedisClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      this.client = redis.createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        retry_strategy: (options) => {
          if (options.error && options.error.code === 'ECONNREFUSED') {
            console.error('Redis connection refused');
            return new Error('Redis connection refused');
          }
          if (options.total_retry_time > 1000 * 60 * 60) {
            return new Error('Redis retry time exhausted');
          }
          if (options.attempt > 10) {
            return undefined;
          }
          return Math.min(options.attempt * 100, 3000);
        }
      });

      this.client.on('error', (error) => {
        console.error('Redis Client Error:', error);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('✅ Redis conectado');
        this.isConnected = true;
      });

      this.client.on('reconnecting', () => {
        console.log('🔄 Redis reconectando...');
      });

      await this.client.connect();
    } catch (error) {
      console.error('Error conectando a Redis:', error);
      // No fallar la aplicación si Redis no está disponible
      this.isConnected = false;
    }
  }

  async disconnect() {
    if (this.client && this.isConnected) {
      await this.client.disconnect();
      this.isConnected = false;
      console.log('✅ Redis desconectado');
    }
  }

  // Wrapper methods con fallback graceful
  async get(key) {
    if (!this.isConnected || !this.client) return null;
    
    try {
      return await this.client.get(key);
    } catch (error) {
      console.error(`Error obteniendo key ${key} de Redis:`, error);
      return null;
    }
  }

  async set(key, value, options = {}) {
    if (!this.isConnected || !this.client) return false;
    
    try {
      const { EX, PX, NX, XX } = options;
      const opts = {};
      if (EX) opts.EX = EX; // seconds
      if (PX) opts.PX = PX; // milliseconds
      if (NX) opts.NX = NX; // only if key doesn't exist
      if (XX) opts.XX = XX; // only if key exists
      
      await this.client.set(key, value, opts);
      return true;
    } catch (error) {
      console.error(`Error guardando key ${key} en Redis:`, error);
      return false;
    }
  }

  async del(key) {
    if (!this.isConnected || !this.client) return false;
    
    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      console.error(`Error eliminando key ${key} de Redis:`, error);
      return false;
    }
  }

  async exists(key) {
    if (!this.isConnected || !this.client) return false;
    
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      console.error(`Error verificando existencia de key ${key}:`, error);
      return false;
    }
  }

  async expire(key, seconds) {
    if (!this.isConnected || !this.client) return false;
    
    try {
      await this.client.expire(key, seconds);
      return true;
    } catch (error) {
      console.error(`Error estableciendo expiración para key ${key}:`, error);
      return false;
    }
  }

  async incr(key) {
    if (!this.isConnected || !this.client) return 0;
    
    try {
      return await this.client.incr(key);
    } catch (error) {
      console.error(`Error incrementando key ${key}:`, error);
      return 0;
    }
  }

  async setex(key, seconds, value) {
    return this.set(key, value, { EX: seconds });
  }

  // Métodos para listas
  async lpush(key, ...values) {
    if (!this.isConnected || !this.client) return false;
    
    try {
      await this.client.lPush(key, values);
      return true;
    } catch (error) {
      console.error(`Error en lpush para key ${key}:`, error);
      return false;
    }
  }

  async rpop(key) {
    if (!this.isConnected || !this.client) return null;
    
    try {
      return await this.client.rPop(key);
    } catch (error) {
      console.error(`Error en rpop para key ${key}:`, error);
      return null;
    }
  }

  async lrange(key, start, stop) {
    if (!this.isConnected || !this.client) return [];
    
    try {
      return await this.client.lRange(key, start, stop);
    } catch (error) {
      console.error(`Error en lrange para key ${key}:`, error);
      return [];
    }
  }

  // Métodos para hashes
  async hset(key, field, value) {
    if (!this.isConnected || !this.client) return false;
    
    try {
      await this.client.hSet(key, field, value);
      return true;
    } catch (error) {
      console.error(`Error en hset para key ${key}:`, error);
      return false;
    }
  }

  async hget(key, field) {
    if (!this.isConnected || !this.client) return null;
    
    try {
      return await this.client.hGet(key, field);
    } catch (error) {
      console.error(`Error en hget para key ${key}:`, error);
      return null;
    }
  }

  async hgetall(key) {
    if (!this.isConnected || !this.client) return {};
    
    try {
      return await this.client.hGetAll(key);
    } catch (error) {
      console.error(`Error en hgetall para key ${key}:`, error);
      return {};
    }
  }

  // Método para limpiar cache por patrón
  async deletePattern(pattern) {
    if (!this.isConnected || !this.client) return false;
    
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
      return true;
    } catch (error) {
      console.error(`Error eliminando patrón ${pattern}:`, error);
      return false;
    }
  }

  // Método para obtener información del servidor
  async info() {
    if (!this.isConnected || !this.client) return null;
    
    try {
      return await this.client.info();
    } catch (error) {
      console.error('Error obteniendo info de Redis:', error);
      return null;
    }
  }
}

// Cache helper functions
class CacheHelper {
  constructor(redisClient) {
    this.redis = redisClient;
    this.defaultTTL = 3600; // 1 hora
  }

  // Cache para búsquedas de productos
  generateProductSearchKey(filters) {
    const sortedFilters = Object.keys(filters)
      .sort()
      .reduce((result, key) => {
        result[key] = filters[key];
        return result;
      }, {});
    
    return `search:products:${Buffer.from(JSON.stringify(sortedFilters)).toString('base64')}`;
  }

  async cacheProductSearch(filters, results, ttl = this.defaultTTL) {
    const key = this.generateProductSearchKey(filters);
    return this.redis.setex(key, ttl, JSON.stringify(results));
  }

  async getCachedProductSearch(filters) {
    const key = this.generateProductSearchKey(filters);
    const cached = await this.redis.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  // Cache para usuarios
  async cacheUser(userId, userData, ttl = this.defaultTTL) {
    const key = `user:${userId}`;
    return this.redis.setex(key, ttl, JSON.stringify(userData));
  }

  async getCachedUser(userId) {
    const key = `user:${userId}`;
    const cached = await this.redis.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  async invalidateUser(userId) {
    const key = `user:${userId}`;
    return this.redis.del(key);
  }

  // Cache para productos populares
  async cachePopularProducts(products, ttl = 7200) { // 2 horas
    const key = 'products:popular';
    return this.redis.setex(key, ttl, JSON.stringify(products));
  }

  async getCachedPopularProducts() {
    const key = 'products:popular';
    const cached = await this.redis.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  // Cache para estadísticas
  async cacheStatistics(type, data, ttl = 1800) { // 30 minutos
    const key = `stats:${type}`;
    return this.redis.setex(key, ttl, JSON.stringify(data));
  }

  async getCachedStatistics(type) {
    const key = `stats:${type}`;
    const cached = await this.redis.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  // Rate limiting
  async checkRateLimit(identifier, limit, windowSeconds = 3600) {
    const key = `rate_limit:${identifier}`;
    const current = await this.redis.incr(key);
    
    if (current === 1) {
      await this.redis.expire(key, windowSeconds);
    }
    
    return {
      current,
      limit,
      remaining: Math.max(0, limit - current),
      resetTime: Date.now() + (windowSeconds * 1000)
    };
  }

  // Session management
  async storeSession(sessionId, userData, ttl = 86400) { // 24 horas
    const key = `session:${sessionId}`;
    return this.redis.setex(key, ttl, JSON.stringify(userData));
  }

  async getSession(sessionId) {
    const key = `session:${sessionId}`;
    const cached = await this.redis.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  async destroySession(sessionId) {
    const key = `session:${sessionId}`;
    return this.redis.del(key);
  }

  // Cache invalidation patterns
  async invalidateProductCaches() {
    await this.redis.deletePattern('search:products:*');
    await this.redis.deletePattern('products:popular');
    await this.redis.deletePattern('stats:products*');
  }

  async invalidateUserCaches(userId) {
    await this.redis.del(`user:${userId}`);
    await this.redis.deletePattern(`search:products:*${userId}*`);
  }

  // Health check
  async healthCheck() {
    try {
      const start = Date.now();
      await this.redis.set('health:check', 'ok', { EX: 10 });
      const result = await this.redis.get('health:check');
      const duration = Date.now() - start;
      
      return {
        status: result === 'ok' ? 'healthy' : 'unhealthy',
        latency: duration,
        connected: this.redis.isConnected
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        connected: false
      };
    }
  }
}

// Singleton instances
const redisClient = new RedisClient();
const cacheHelper = new CacheHelper(redisClient);

module.exports = {
  redisClient,
  cacheHelper,
  RedisClient,
  CacheHelper
};