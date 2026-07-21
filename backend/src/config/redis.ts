import Redis from 'ioredis';

export const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  retryStrategy: (times: number) => {
    if (times > 3) {
      console.log('⚠️ Redis connection failed after 3 retries. Continuing without Redis...');
      return null;
    }
    return Math.min(times * 50, 2000);
  }
});

redis.on('error', (err) => {
  console.log('⚠️ Redis error (session storage will use memory fallback):', err.message);
});

redis.on('connect', () => {
  console.log('✅ Redis connected');
});
