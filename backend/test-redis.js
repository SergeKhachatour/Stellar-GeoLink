require('dotenv').config();
const redisClient = require('./config/redis');

async function testRedis() {
    try {
        // Test set/get
        await redisClient.set('test_key', 'test_value');
        const value = await redisClient.get('test_key');
        console.log('Test value:', value);

        // Test rate limiter
        const key = 'rate_limit:test';
        await redisClient.del(key);
        for (let i = 0; i < 5; i++) {
            const count = await redisClient.incr(key);
            console.log(`Request ${i + 1}: Count = ${count}`);
        }
    } catch (error) {
        console.error('Redis test failed:', error);
    } finally {
        await redisClient.quit();
    }
}

testRedis(); 