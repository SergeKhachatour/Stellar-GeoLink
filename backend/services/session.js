const redisClient = require('../config/redis');
const pool = require('../config/database');
const crypto = require('crypto');

const SESSION_TTL = 86400; // 24 hours
const EXTENDED_SESSION_TTL = 2592000; // 30 days

const sessionService = {
    async createSession(userId, data, rememberMe = false, deviceInfo = {}) {
        const sessionId = crypto.randomBytes(32).toString('hex');
        const ttl = rememberMe ? EXTENDED_SESSION_TTL : SESSION_TTL;
        const expiresAt = new Date(Date.now() + ttl * 1000);

        // Store in Redis
        await redisClient.set(
            `session:${sessionId}`,
            JSON.stringify({ userId, ...data }),
            'EX',
            ttl
        );

        // Store in database for tracking
        await pool.query(
            `INSERT INTO user_sessions 
            (user_id, session_id, device_info, ip_address, remember_me, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6)`,
            [userId, sessionId, deviceInfo, data.ipAddress, rememberMe, expiresAt]
        );

        return sessionId;
    },

    async getSession(sessionId) {
        const data = await redisClient.get(`session:${sessionId}`);
        if (data) {
            // Update last activity
            await pool.query(
                `UPDATE user_sessions 
                SET last_activity = CURRENT_TIMESTAMP 
                WHERE session_id = $1`,
                [sessionId]
            );
            return JSON.parse(data);
        }
        return null;
    },

    async invalidateSession(sessionId) {
        await redisClient.del(`session:${sessionId}`);
        await pool.query(
            'DELETE FROM user_sessions WHERE session_id = $1',
            [sessionId]
        );
    },

    async getUserSessions(userId) {
        const result = await pool.query(
            `SELECT * FROM user_sessions 
            WHERE user_id = $1 
            ORDER BY last_activity DESC`,
            [userId]
        );
        return result.rows;
    }
};

module.exports = sessionService; 