const redisClient = require('../config/redis');

const CACHE_TTL = 3600; // 1 hour in seconds

const cacheWalletLocation = async (publicKey, data) => {
    await redisClient.setex(`wallet:${publicKey}`, 300, JSON.stringify(data));
};

const getCachedWalletLocation = async (publicKey) => {
    const cached = await redisClient.get(`wallet:${publicKey}`);
    return cached ? JSON.parse(cached) : null;
};

const cacheService = {
    async get(key) {
        return await redisClient.get(`cache:${key}`);
    },

    async set(key, value, ttl = CACHE_TTL) {
        await redisClient.set(`cache:${key}`, value, 'EX', ttl);
    },

    async invalidate(key) {
        await redisClient.del(`cache:${key}`);
    }
};

module.exports = {
    cacheWalletLocation,
    getCachedWalletLocation,
    cacheService
}; 