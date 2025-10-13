const Redis = require('ioredis');

// Check if Redis is available (for Azure deployment)
const isRedisAvailable = process.env.REDIS_HOST && process.env.REDIS_HOST !== '127.0.0.1';

let redisClient;

if (isRedisAvailable) {
    // Use Redis if configured
    redisClient = new Redis({
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD,
        retryStrategy: function(times) {
            const delay = Math.min(times * 50, 2000);
            return delay;
        },
        maxRetriesPerRequest: 1
    });

    redisClient.on('error', (err) => {
        console.error('Redis connection error:', err);
    });

    redisClient.on('connect', () => {
        console.log('Successfully connected to Redis');
    });
} else {
    // Mock Redis client for Azure deployment
    console.log('Redis not configured - using mock client for Azure deployment');
    redisClient = {
        get: async () => null,
        set: async () => 'OK',
        setex: async () => 'OK',
        del: async () => 1,
        on: () => {},
        quit: async () => {}
    };
}

module.exports = redisClient; 